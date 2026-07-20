-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('CLOCKED_IN', 'CLOCKED_OUT', 'ON_BREAK');

-- CreateTable
CREATE TABLE "attendance_logs" (
    "attendance_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "work_date" TIMESTAMP(3) NOT NULL,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'CLOCKED_OUT',
    "first_clock_in_at" TIMESTAMP(3),
    "last_clock_out_at" TIMESTAMP(3),
    "total_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "is_late" BOOLEAN DEFAULT false,
    "is_manual_entry" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_logs_pkey" PRIMARY KEY ("attendance_id")
);

-- CreateTable
CREATE TABLE "clock_sessions" (
    "session_id" TEXT NOT NULL,
    "attendance_id" TEXT NOT NULL,
    "clock_in_at" TIMESTAMP(3) NOT NULL,
    "clock_out_at" TIMESTAMP(3),
    "clock_in_lat" DECIMAL(9,6),
    "clock_in_lng" DECIMAL(9,6),
    "clock_in_ip" TEXT,
    "clock_out_lat" DECIMAL(9,6),
    "clock_out_lng" DECIMAL(9,6),
    "clock_out_ip" TEXT,
    "duration_minutes" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clock_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateIndex
CREATE INDEX "attendance_logs_user_id_idx" ON "attendance_logs"("user_id");

-- CreateIndex
CREATE INDEX "attendance_logs_work_date_idx" ON "attendance_logs"("work_date");

-- CreateIndex
CREATE INDEX "attendance_logs_user_id_status_idx" ON "attendance_logs"("user_id", "status");

-- CreateIndex
CREATE INDEX "attendance_logs_user_id_work_date_idx" ON "attendance_logs"("user_id", "work_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_logs_user_id_work_date_key" ON "attendance_logs"("user_id", "work_date");

-- CreateIndex
CREATE INDEX "clock_sessions_attendance_id_idx" ON "clock_sessions"("attendance_id");

-- AddForeignKey
ALTER TABLE "attendance_logs" ADD CONSTRAINT "attendance_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clock_sessions" ADD CONSTRAINT "clock_sessions_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance_logs"("attendance_id") ON DELETE CASCADE ON UPDATE CASCADE;
