import prisma from '../../prisma.config';
import { Request, Response } from 'express';
import { Prisma, AttendanceStatus } from '@prisma/client';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

// Normalizes any Date/string to 00:00:00 UTC of that calendar day.
// This is the value stored in AttendanceLog.work_date, so every
// clock-in on the same day resolves to the same row.
const toDateOnlyUTC = (input?: string | Date): Date => {
  const d = input ? new Date(input) : new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const minutesBetween = (start: Date, end: Date): number =>
  Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));

// Recomputes AttendanceLog.total_hours / first_clock_in_at /
// last_clock_out_at from its ClockSession children — but deliberately
// does NOT touch `status`. Status is set explicitly by whichever
// action called this (clockIn / clockOut / pauseClock / resumeClock),
// because "no open session" is ambiguous on its own: it means
// CLOCKED_OUT if the person is done for the day, or ON_BREAK if
// they've paused and plan to resume. Call this after any session
// is created, closed, or edited.
const recalculateAttendanceTotals = async (attendance_id: string) => {
  const sessions = await prisma.clockSession.findMany({
    where: { attendance_id },
    orderBy: { clock_in_at: 'asc' },
  });

  const totalMinutes = sessions.reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);

  const firstClockIn = sessions.length ? sessions[0].clock_in_at : null;
  const closedSessions = sessions.filter(s => s.clock_out_at);
  const lastClockOut = closedSessions.length
    ? closedSessions[closedSessions.length - 1].clock_out_at
    : null;

  return prisma.attendanceLog.update({
    where: { attendance_id },
    data: {
      total_hours: new Prisma.Decimal((totalMinutes / 60).toFixed(2)),
      first_clock_in_at: firstClockIn,
      last_clock_out_at: lastClockOut,
    },
  });
};

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/clock-in
// Body: { user_id, latitude?, longitude? }
// ─────────────────────────────────────────────────────────────

export const clockIn = async (req: Request, res: Response) => {
  try {
    const { user_id, latitude, longitude } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const user = await prisma.user.findUnique({ where: { user_id } });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const work_date = toDateOnlyUTC();
    const now = new Date();
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;

    // Find or create today's attendance row for this user
    let attendance = await prisma.attendanceLog.findUnique({
      where: { user_id_work_date: { user_id, work_date } },
      include: { sessions: true },
    });

    if (!attendance) {
      attendance = await prisma.attendanceLog.create({
        data: { user_id, work_date, status: AttendanceStatus.CLOCKED_OUT },
        include: { sessions: true },
      });
    }

    const alreadyOpen = attendance.sessions.some(s => !s.clock_out_at);
    if (attendance.status === AttendanceStatus.CLOCKED_IN || alreadyOpen) {
      return res.status(400).json({ error: 'User is already clocked in' });
    }
    if (attendance.status === AttendanceStatus.ON_BREAK) {
      return res.status(400).json({ error: 'User is on a break — use /attendance/resume instead' });
    }

    await prisma.clockSession.create({
      data: {
        attendance_id: attendance.attendance_id,
        clock_in_at: now,
        clock_in_lat: latitude !== undefined ? new Prisma.Decimal(latitude) : undefined,
        clock_in_lng: longitude !== undefined ? new Prisma.Decimal(longitude) : undefined,
        clock_in_ip: ip,
      },
    });

    await prisma.attendanceLog.update({
      where: { attendance_id: attendance.attendance_id },
      data: { status: AttendanceStatus.CLOCKED_IN },
    });

    const updated = await recalculateAttendanceTotals(attendance.attendance_id);

    const full = await prisma.attendanceLog.findUnique({
      where: { attendance_id: updated.attendance_id },
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    res.status(200).json({
      message: 'Clocked in successfully',
      data: full,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/clock-out
// Body: { user_id, latitude?, longitude? }
// ─────────────────────────────────────────────────────────────

export const clockOut = async (req: Request, res: Response) => {
  try {
    const { user_id, latitude, longitude } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const work_date = toDateOnlyUTC();
    const now = new Date();
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;

    const attendance = await prisma.attendanceLog.findUnique({
      where: { user_id_work_date: { user_id, work_date } },
      include: { sessions: true },
    });

    if (!attendance) {
      return res.status(400).json({ error: 'User has not clocked in today' });
    }

    if (attendance.status === AttendanceStatus.CLOCKED_OUT) {
      return res.status(400).json({ error: 'User has already clocked out for the day' });
    }

    const openSession = attendance.sessions
      .filter(s => !s.clock_out_at)
      .sort((a, b) => b.clock_in_at.getTime() - a.clock_in_at.getTime())[0];

    // If they're ON_BREAK there's no open session to close — that's fine,
    // clocking out just finalizes the day as-is. If they're CLOCKED_IN,
    // close the active session first.
    if (openSession) {
      await prisma.clockSession.update({
        where: { session_id: openSession.session_id },
        data: {
          clock_out_at: now,
          clock_out_lat: latitude !== undefined ? new Prisma.Decimal(latitude) : undefined,
          clock_out_lng: longitude !== undefined ? new Prisma.Decimal(longitude) : undefined,
          clock_out_ip: ip,
          duration_minutes: minutesBetween(openSession.clock_in_at, now),
        },
      });
    }

    await prisma.attendanceLog.update({
      where: { attendance_id: attendance.attendance_id },
      data: { status: AttendanceStatus.CLOCKED_OUT },
    });

    const updated = await recalculateAttendanceTotals(attendance.attendance_id);

    const full = await prisma.attendanceLog.findUnique({
      where: { attendance_id: updated.attendance_id },
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    res.status(200).json({
      message: 'Clocked out successfully',
      data: full,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/pause
// Body: { user_id }
// Stops the timer WITHOUT ending the day — e.g. lunch, a break,
// stepping away. Distinct from clockOut: status becomes ON_BREAK,
// not CLOCKED_OUT, and the day stays open for resumeClock.
// ─────────────────────────────────────────────────────────────

export const pauseClock = async (req: Request, res: Response) => {
  try {
    const { user_id } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const work_date = toDateOnlyUTC();
    const now = new Date();

    const attendance = await prisma.attendanceLog.findUnique({
      where: { user_id_work_date: { user_id, work_date } },
      include: { sessions: true },
    });

    if (!attendance || attendance.status !== AttendanceStatus.CLOCKED_IN) {
      return res.status(400).json({ error: 'User is not currently clocked in' });
    }

    const openSession = attendance.sessions
      .filter(s => !s.clock_out_at)
      .sort((a, b) => b.clock_in_at.getTime() - a.clock_in_at.getTime())[0];

    if (!openSession) {
      return res.status(400).json({ error: 'No active session found to pause' });
    }

    await prisma.clockSession.update({
      where: { session_id: openSession.session_id },
      data: {
        clock_out_at: now,
        duration_minutes: minutesBetween(openSession.clock_in_at, now),
      },
    });

    await prisma.attendanceLog.update({
      where: { attendance_id: attendance.attendance_id },
      data: { status: AttendanceStatus.ON_BREAK },
    });

    const updated = await recalculateAttendanceTotals(attendance.attendance_id);

    const full = await prisma.attendanceLog.findUnique({
      where: { attendance_id: updated.attendance_id },
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    res.status(200).json({
      message: 'Timer paused',
      data: full,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// POST /api/attendance/resume
// Body: { user_id, latitude?, longitude? }
// Restarts the timer from ON_BREAK — opens a new ClockSession
// under the SAME day's AttendanceLog, so hours keep accumulating.
// ─────────────────────────────────────────────────────────────

export const resumeClock = async (req: Request, res: Response) => {
  try {
    const { user_id, latitude, longitude } = req.body;

    if (!user_id) {
      return res.status(400).json({ error: 'user_id is required' });
    }

    const work_date = toDateOnlyUTC();
    const now = new Date();
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || undefined;

    const attendance = await prisma.attendanceLog.findUnique({
      where: { user_id_work_date: { user_id, work_date } },
    });

    if (!attendance || attendance.status !== AttendanceStatus.ON_BREAK) {
      return res.status(400).json({ error: 'User is not currently on a break' });
    }

    await prisma.clockSession.create({
      data: {
        attendance_id: attendance.attendance_id,
        clock_in_at: now,
        clock_in_lat: latitude !== undefined ? new Prisma.Decimal(latitude) : undefined,
        clock_in_lng: longitude !== undefined ? new Prisma.Decimal(longitude) : undefined,
        clock_in_ip: ip,
      },
    });

    await prisma.attendanceLog.update({
      where: { attendance_id: attendance.attendance_id },
      data: { status: AttendanceStatus.CLOCKED_IN },
    });

    const updated = await recalculateAttendanceTotals(attendance.attendance_id);

    const full = await prisma.attendanceLog.findUnique({
      where: { attendance_id: updated.attendance_id },
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    res.status(200).json({
      message: 'Timer resumed',
      data: full,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /attendance/status/:userId
// Today's clock status for a single user
// ─────────────────────────────────────────────────────────────

export const getTodayStatus = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;
    const work_date = toDateOnlyUTC();

    const attendance = await prisma.attendanceLog.findUnique({
      where: { user_id_work_date: { user_id: userId, work_date } },
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    if (!attendance) {
      return res.json({
        data: {
          user_id: userId,
          work_date,
          status: 'NOT_CLOCKED_IN',
          total_hours: 0,
          sessions: [],
        },
      });
    }

    res.json({ data: attendance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/:userId?start_date=&end_date=&page=&limit=
// Paginated attendance history for one user
// ─────────────────────────────────────────────────────────────

export const getUserAttendance = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const skip  = (page - 1) * limit;

    const where: any = { user_id: userId };

    if (req.query.start_date || req.query.end_date) {
      where.work_date = {};
      if (req.query.start_date) where.work_date.gte = toDateOnlyUTC(req.query.start_date as string);
      if (req.query.end_date)   where.work_date.lte = toDateOnlyUTC(req.query.end_date as string);
    }

    if (req.query.status) {
      where.status = (req.query.status as string).toUpperCase();
    }

    const [logs, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { work_date: 'desc' },
        include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
      }),
      prisma.attendanceLog.count({ where }),
    ]);

    res.json({
      data: logs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/attendance?search=&status=&start_date=&end_date=&page=&limit=
// Admin-facing listing across all users
// ─────────────────────────────────────────────────────────────

export const getAllAttendance = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 30));
    const skip  = (page - 1) * limit;

    const search = (req.query.search as string)?.trim();
    const status = req.query.status as string | undefined;

    const where: any = {};

    if (status && Object.values(AttendanceStatus).includes(status.toUpperCase() as AttendanceStatus)) {
      where.status = status.toUpperCase();
    }

    if (req.query.start_date || req.query.end_date) {
      where.work_date = {};
      if (req.query.start_date) where.work_date.gte = toDateOnlyUTC(req.query.start_date as string);
      if (req.query.end_date)   where.work_date.lte = toDateOnlyUTC(req.query.end_date as string);
    }

    if (search) {
      where.user = {
        OR: [
          { name:  { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ],
      };
    }

    const [logs, total] = await Promise.all([
      prisma.attendanceLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: [{ work_date: 'desc' }, { user: { name: 'asc' } }],
        include: {
          user: { select: { user_id: true, name: true, email: true } },
          sessions: { orderBy: { clock_in_at: 'asc' } },
        },
      }),
      prisma.attendanceLog.count({ where }),
    ]);

    res.json({
      data: logs,
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/:userId/:date   (date = YYYY-MM-DD)
// Single-day detail with all sessions
// ─────────────────────────────────────────────────────────────

export const getAttendanceByDate = async (req: Request, res: Response) => {
  try {
    const { userId, date } = req.params;
    const work_date = toDateOnlyUTC(date);

    const attendance = await prisma.attendanceLog.findUnique({
      where: { user_id_work_date: { user_id: userId, work_date } },
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    if (!attendance) {
      return res.status(404).json({ error: 'No attendance record found for that date' });
    }

    res.json({ data: attendance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// PATCH /api/attendance/:attendanceId
// Admin manual correction — e.g. someone forgot to clock out.
// Body: { first_clock_in_at?, last_clock_out_at?, total_hours?,
//          status?, notes? }
// ─────────────────────────────────────────────────────────────

export const updateAttendanceRecord = async (req: Request, res: Response) => {
  try {
    const { attendanceId } = req.params;
    const { first_clock_in_at, last_clock_out_at, total_hours, status, notes } = req.body;

    const existing = await prisma.attendanceLog.findUnique({ where: { attendance_id: attendanceId } });
    if (!existing) {
      return res.status(404).json({ error: 'Attendance record not found' });
    }

    if (status && !Object.values(AttendanceStatus).includes(status)) {
      return res.status(400).json({ error: 'Invalid status value' });
    }

    const updateData: any = { is_manual_entry: true };
    if (first_clock_in_at !== undefined) updateData.first_clock_in_at = new Date(first_clock_in_at);
    if (last_clock_out_at !== undefined) updateData.last_clock_out_at = new Date(last_clock_out_at);
    if (total_hours       !== undefined) updateData.total_hours = new Prisma.Decimal(total_hours);
    if (status             !== undefined) updateData.status = status;
    if (notes              !== undefined) updateData.notes = notes;

    const updated = await prisma.attendanceLog.update({
      where: { attendance_id: attendanceId },
      data: updateData,
      include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
    });

    res.json({
      message: 'Attendance record updated successfully',
      data: updated,
    });
  } catch (err: any) {
    if (err.code === 'P2025') return res.status(404).json({ error: 'Attendance record not found' });
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};

// ─────────────────────────────────────────────────────────────
// GET /api/attendance/:userId/summary?start_date=&end_date=
// Aggregate total hours for a date range (handy for payroll batch tie-in)
// ─────────────────────────────────────────────────────────────

export const getAttendanceSummary = async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    const where: any = { user_id: userId };
    if (req.query.start_date || req.query.end_date) {
      where.work_date = {};
      if (req.query.start_date) where.work_date.gte = toDateOnlyUTC(req.query.start_date as string);
      if (req.query.end_date)   where.work_date.lte = toDateOnlyUTC(req.query.end_date as string);
    }

    const logs = await prisma.attendanceLog.findMany({
      where,
      orderBy: { work_date: 'asc' },
      select: { work_date: true, total_hours: true, status: true },
    });

    const totalHours = logs.reduce((sum, l) => sum + Number(l.total_hours), 0);
    const daysPresent = logs.filter(l => Number(l.total_hours) > 0).length;

    res.json({
      data: {
        user_id: userId,
        days_present: daysPresent,
        total_hours: Number(totalHours.toFixed(2)),
        daily_breakdown: logs,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};




// ─────────────────────────────────────────────────────────────
// Paste this into your existing attendance controller file
// (same file as clockIn / clockOut / getAllAttendance, etc.)
// It relies on `prisma`, `toDateOnlyUTC`, and `AttendanceStatus`
// which are already imported/defined at the top of that file.
// ─────────────────────────────────────────────────────────────

// GET /api/attendance/live-status?search=&status=&page=&limit=
// Admin roster view — EVERY active user's status right now,
// including users who haven't clocked in at all today (which
// getAllAttendance can't show, since it only queries rows that
// already exist in AttendanceLog).

export const getLiveStatus = async (req: Request, res: Response) => {
  try {
    const page  = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 20));
    const skip  = (page - 1) * limit;

    const search = (req.query.search as string)?.trim();
    const statusFilter = (req.query.status as string)?.toUpperCase();
    const work_date = toDateOnlyUTC();

    // Base filter (search only) — reused for the summary counts so
    // the counts always reflect the current search, independent of
    // whichever status card the admin has toggled on.
    const baseWhere: any = { status: 'ACTIVE' };
    if (search) {
      baseWhere.OR = [
        { name:  { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
      ];
    }

    // Full filter (search + status) for the actual page of rows.
    const where: any = { ...baseWhere };
    if (statusFilter === 'NOT_CLOCKED_IN') {
      where.attendance_logs = { none: { work_date } };
    } else if (statusFilter && Object.values(AttendanceStatus).includes(statusFilter as AttendanceStatus)) {
      where.attendance_logs = { some: { work_date, status: statusFilter as AttendanceStatus } };
    }

    const [users, total, clockedIn, onBreak, clockedOut, totalActive] = await Promise.all([
      prisma.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          user_id: true,
          name: true,
          email: true,
          attendance_logs: {
            where: { work_date },
            include: { sessions: { orderBy: { clock_in_at: 'asc' } } },
          },
        },
      }),
      prisma.user.count({ where }),
      prisma.user.count({ where: { ...baseWhere, attendance_logs: { some: { work_date, status: AttendanceStatus.CLOCKED_IN } } } }),
      prisma.user.count({ where: { ...baseWhere, attendance_logs: { some: { work_date, status: AttendanceStatus.ON_BREAK } } } }),
      prisma.user.count({ where: { ...baseWhere, attendance_logs: { some: { work_date, status: AttendanceStatus.CLOCKED_OUT } } } }),
      prisma.user.count({ where: baseWhere }),
    ]);

    const data = users.map((u) => {
      const log = u.attendance_logs[0];
      return {
        user_id: u.user_id,
        name: u.name,
        email: u.email,
        attendance_id: log?.attendance_id ?? null,
        status: log?.status ?? 'NOT_CLOCKED_IN',
        first_clock_in_at: log?.first_clock_in_at ?? null,
        last_clock_out_at: log?.last_clock_out_at ?? null,
        total_hours: log ? Number(log.total_hours) : 0,
        is_manual_entry: log?.is_manual_entry ?? false,
        sessions: log?.sessions ?? [],
      };
    });

    res.json({
      data,
      work_date,
      counts: {
        clocked_in: clockedIn,
        on_break: onBreak,
        clocked_out: clockedOut,
        not_clocked_in: totalActive - clockedIn - onBreak - clockedOut,
      },
      paging: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
};
