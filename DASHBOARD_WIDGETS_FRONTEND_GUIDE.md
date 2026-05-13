# Dashboard Widgets — Frontend Integration Guide

All endpoints are prefixed with `/api/dashboard` and require a valid JWT (`Authorization: Bearer <token>`).

---

## Table of Contents

1. [New Widgets](#new-widgets)
   - [Job Requests (Front Office)](#1-job-requests-front-office)
   - [Expiring Documents (Back Office)](#2-expiring-documents-back-office)
   - [Send Expiry Reminder Emails (Back Office)](#3-send-expiry-reminder-emails-back-office)
2. [Existing Widgets (unchanged)](#existing-widgets-unchanged)
3. [Color Reference](#color-reference)

---

## New Widgets

### 1. Job Requests (Front Office)

> Shows all jobs where the authenticated user is the **manager**.

```
GET /api/dashboard/widget/frontOffice/jobRequests/:userId
```

#### Query Parameters

| Param       | Type   | Default | Description                                       |
|-------------|--------|---------|---------------------------------------------------|
| `statuses`  | string | all     | Comma-separated `JobStatus` values to filter by   |
| `dateRange` | string | all     | `today`, `week`, `month`, or `year`               |
| `limit`     | number | 10      | Max number of jobs returned                       |

#### Response Shape

```jsonc
{
  "success": true,
  "data": {
    "total": 4,
    "byStatus": [
      { "status": "OPEN",   "count": 2 },
      { "status": "CLOSED", "count": 1 },
      { "status": "DRAFT",  "count": 1 }
    ],
    "jobs": [
      {
        "job_id":          "uuid",
        "job_title":       "Senior Developer",
        "status":          "OPEN",
        "job_type":        "FULL_TIME",
        "location":        "Remote",
        "open_positions":  3,
        "max_positions":   5,
        "start_date":      "2026-06-01T00:00:00.000Z",
        "end_date":        "2026-12-31T00:00:00.000Z",
        "approved":        true,
        "created_at":      "2026-05-01T00:00:00.000Z",
        "applicationCount": 12,
        "organization": {
          "organization_id": "uuid",
          "name":            "Acme Corp",
          "status":          "ACTIVE"
        },
        "company_office": {
          "company_office_id": "uuid",
          "office_name":       "HQ",
          "city":              "New York",
          "state":             "NY"
        }
      }
    ]
  }
}
```

#### Notes
- `applicationCount` is pre-computed — no extra call needed.
- `byStatus` always reflects **all** jobs for that manager (ignoring the current filters) — useful for a status tab bar.
- Filter by status: `?statuses=OPEN,DRAFT`

---

### 2. Expiring Documents (Front Office)

> Returns all organization documents that are **overdue OR expiring within the next 60 days**, grouped into 5 urgency buckets with color metadata ready to use in the UI.

```
GET /api/dashboard/widget/frontOffice/expiringDocuments/:userId
```

#### Query Parameters

| Param   | Type   | Default | Description              |
|---------|--------|---------|--------------------------|
| `limit` | number | 50      | Max total documents returned |

#### Bucket System

| Bucket      | Days Remaining | Color     | Hex       | Background Hex |
|-------------|---------------|-----------|-----------|---------------|
| `overdue`   | past due (< 0) | Red      | `#ef4444` | `#fee2e2`     |
| `critical`  | 1–15 days      | Red      | `#ef4444` | `#fee2e2`     |
| `warning`   | 16–30 days     | Orange   | `#f97316` | `#ffedd5`     |
| `attention` | 31–45 days     | Orange   | `#f97316` | `#ffedd5`     |
| `watch`     | 46–60 days     | Yellow   | `#eab308` | `#fef9c3`     |

#### Response Shape

```jsonc
{
  "success": true,
  "data": {
    "total": 7,
    "lookahead": 60,
    "summary": {
      "overdue":   1,
      "critical":  2,
      "warning":   1,
      "attention": 2,
      "watch":     1
    },
    "buckets": {
      "overdue": {
        "label":    "Overdue",
        "color":    "#ef4444",
        "bgColor":  "#fee2e2",
        "daysRange":"past due",
        "count":    1,
        "documents": [
          {
            "document_id":       "uuid",
            "document_name":     "Insurance Certificate.pdf",
            "document_type":     "PDF",
            "privacy":           "PRIVATE",
            "expiration_date":   "2026-04-30T00:00:00.000Z",
            "expiration_reason": "Annual renewal required by insurer",
            "upload_date":       "2025-05-01T00:00:00.000Z",
            "days_left":         -12,
            "is_overdue":        true,
            "bucket":            "overdue",
            "color":             "#ef4444",
            "bg_color":          "#fee2e2",
            "organization": {
              "organization_id": "uuid",
              "name":            "Acme Corp",
              "status":          "ACTIVE"
            },
            "title": {
              "document_title_id": "uuid",
              "document_title":    "Liability Insurance"
            },
            "user": {
              "user_id": "uuid",
              "name":    "Jane Smith",
              "email":   "jane@example.com"
            }
          }
        ]
      },
      "critical":  { "label": "Critical",  "color": "#ef4444", "bgColor": "#fee2e2", "daysRange": "1–15 days",  "count": 2, "documents": [] },
      "warning":   { "label": "Warning",   "color": "#f97316", "bgColor": "#ffedd5", "daysRange": "16–30 days", "count": 1, "documents": [] },
      "attention": { "label": "Attention", "color": "#f97316", "bgColor": "#ffedd5", "daysRange": "31–45 days", "count": 2, "documents": [] },
      "watch":     { "label": "Watch",     "color": "#eab308", "bgColor": "#fef9c3", "daysRange": "46–60 days", "count": 1, "documents": [] }
    }
  }
}
```

#### Document Fields

| Field               | Type            | Description                                              |
|---------------------|-----------------|----------------------------------------------------------|
| `days_left`         | `number`        | Days until expiry. **Negative = already overdue.**       |
| `is_overdue`        | `boolean`       | Convenience flag: `days_left < 0`                        |
| `bucket`            | `string`        | One of: `overdue`, `critical`, `warning`, `attention`, `watch` |
| `color`             | `string`        | CSS text/icon color — apply directly                     |
| `bg_color`          | `string`        | CSS background color — apply directly                    |
| `expiration_reason` | `string\|null`  | Optional reason text explaining why the doc is expiring  |

#### Usage Tips

```tsx
// Render a badge using the colors from the API — no local logic needed
<span style={{ color: doc.color, backgroundColor: doc.bg_color }}>
  {doc.is_overdue
    ? `Overdue by ${Math.abs(doc.days_left)} days`
    : `Expires in ${doc.days_left} day${doc.days_left === 1 ? '' : 's'}`}
</span>

// Iterate all buckets in order
const BUCKET_ORDER = ['overdue', 'critical', 'warning', 'attention', 'watch'];

BUCKET_ORDER.map(key => {
  const bucket = data.buckets[key];
  return bucket.count > 0 ? <BucketSection key={key} bucket={bucket} /> : null;
});
```

---

### 3. Send Expiry Reminder Emails (Front Office)

> Triggers reminder emails to the uploader of **every** document that is overdue or expiring within 60 days. Safe to call from a "Send All Reminders" button or a cron job.

```
POST /api/dashboard/widget/frontOffice/expiringDocuments/sendReminders
```

No request body required.

#### Response Shape

```jsonc
{
  "success": true,
  "data": {
    "message": "Reminder emails sent: 6 succeeded, 1 failed",
    "total":   7,
    "sent":    6,
    "failed":  1,
    "results": [
      {
        "document_id":   "uuid",
        "document_name": "Insurance Certificate.pdf",
        "recipient":     "jane@example.com",
        "days_left":     -12,
        "is_overdue":    true,
        "email_sent":    true,
        "error":         null
      },
      {
        "document_id":   "uuid",
        "document_name": "Tax Registration.pdf",
        "recipient":     "bob@example.com",
        "days_left":     10,
        "is_overdue":    false,
        "email_sent":    false,
        "error":         "Mailbox unavailable"
      }
    ]
  }
}
```

#### Email Content (sent to each uploader)

The HTML email includes:
- Document name, category (title), and type
- Organization name
- Expiration date (formatted)
- `expiration_reason` (if set)
- Color-coded urgency banner matching the same color system as the widget
- Days remaining (or "OVERDUE" if past due)

---

## Existing Widgets (unchanged)

These were not modified. Listed for completeness.

| Office       | Route                                             | Description                       |
|--------------|---------------------------------------------------|-----------------------------------|
| Back Office  | `GET /widget/backOffice/userStats/:userId`        | User counts by role               |
| Back Office  | `GET /widget/backOffice/orgStats/:userId`         | Organization statistics           |
| Back Office  | `GET /widget/backOffice/timesheets/:userId`       | Timesheet summaries               |
| Back Office  | `GET /widget/backOffice/invoiceStats/:userId`     | Invoice statistics                |
| Back Office  | `GET /widget/backOffice/contracts/:userId`        | Contract summaries                |
| Back Office  | `GET /widget/backOffice/myTasks/:userId`                   | Grouped tasks for back office     |
| Front Office | `GET /widget/frontOffice/expiringDocuments/:userId`        | Expiring document warnings        |
| Front Office | `POST /widget/frontOffice/expiringDocuments/sendReminders` | Send reminder emails              |
| Front Office | `GET /widget/frontOffice/jobStats/:userId`        | Job statistics                    |
| Front Office | `GET /widget/frontOffice/applications/:userId`    | Application statistics            |
| Front Office | `GET /widget/frontOffice/pipeline/:userId`        | Pipeline stage breakdown          |
| Front Office | `GET /widget/frontOffice/candidates/:userId`      | Candidate statistics              |
| Front Office | `GET /widget/frontOffice/interviews/:userId`      | Interview statistics              |
| Front Office | `GET /widget/frontOffice/myTasks/:userId`         | Task list for front office user   |
| Client Office| `GET /widget/clientOffice/myOrgs/:userId`         | Organizations linked to client    |
| Client Office| `GET /widget/clientOffice/jobStats/:userId`       | Client-scoped job stats           |
| Client Office| `GET /widget/clientOffice/applicationFunnel/:userId` | Application funnel             |
| Client Office| `GET /widget/clientOffice/invoices/:userId`       | Client invoices                   |

---

## Color Reference

| Urgency   | Text Color | Background | When to use                              |
|-----------|-----------|------------|------------------------------------------|
| Red       | `#ef4444` | `#fee2e2`  | Overdue or expiring within 15 days       |
| Orange    | `#f97316` | `#ffedd5`  | Expiring in 16–45 days                   |
| Yellow    | `#eab308` | `#fef9c3`  | Expiring in 46–60 days                   |

The API returns `color` and `bg_color` on every document object — **you do not need to re-implement this logic on the frontend**.
