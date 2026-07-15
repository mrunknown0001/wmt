# WMT — Workload Management Tool

Operational workload management platform with Asana-like task management, organizational governance, and workflow automation. Built with Laravel 13 + Inertia.js + React.

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | Laravel 13 (PHP 8.3+) |
| Frontend | Inertia.js + React (JSX) |
| Database | MySQL 8.0 |
| Cache/Sessions/Queues | Redis |
| WebSockets | Soketi (Pusher-protocol) |
| Real-time client | Laravel Echo |
| Auth/Permissions | spatie/laravel-permission + Laravel Sanctum |
| Styling | Tailwind CSS v4 |
| Rich Text | TipTap (WYSIWYG editor) |
| Drag & Drop | @dnd-kit |
| Push Notifications | Firebase Cloud Messaging (FCM) |
| CAPTCHA | Cloudflare Turnstile |
| AI | OpenAI / OpenRouter (configurable via `AI_PLATFORM` env var) |
| Dev environment | Docker Compose |

## Getting Started

```bash
# Start Docker services
docker compose up -d

# Install dependencies
composer install
npm install

# Setup database
php artisan migrate:fresh --seed

# Run dev server (php server + queue worker + vite)
composer run dev
```

Default admin login: `admin@wmt.com` / `password`

## Key Features

- **Organization Hierarchy** — Divisions → Departments → Teams → Users
- **Project Management** — Full CRUD with owner/admin roles, member management, archived projects view
- **Kanban Board** — Drag-and-drop task cards with inline editing and 5 views (list/board/calendar/gantt/dashboard)
- **Multi-Select & Bulk Editing** — Asana-style: select tasks via click/Ctrl/Shift/Ctrl+A, then edit via the bulk toolbar or inline — any change (status, priority, assignee, dates, custom fields) applies to every selected task
- **Task Sections** — Asana-style grouping within projects (creatable even before the first task)
- **Subtasks** — Hierarchical parent-child tasks with progress tracking
- **Recurring Tasks** — Daily/weekly/monthly/yearly with auto-generation
- **Task Attachments** — Direct file uploads on tasks and comments
- **Comments & @Mentions** — Rich text comments with user mentions and file attachments
- **Real-time Notifications** — WebSocket push + email + FCM push notifications (8 types, per-user preferences, bookmark/archive/mention filters)
- **Escalated Due Dates** — Tiered overdue escalation through org hierarchy
- **Workflow Automation** — Project-level rule builder (trigger → conditions → actions)
- **Global Search** — Search across projects, tasks, and users from any page
- **AI Chat Assistant** — Streaming multi-turn conversations with organizational context
- **Executive Dashboard** — Org-wide stats with hierarchical drill-down
- **Customizable Dashboard** — 7 togglable widgets, persisted per user
- **Activity Log** — Centralized audit trail across all projects
- **Custom Fields** — 7 types (text, textarea, number, date, single select, multi select, formula) per project with inline and bulk editing
- **Form Builder** — Asana-style form designer with drag-and-drop, 12 field types (incl. email, attachments, camera photo/video capture), custom field mapping, conditional visibility, auto-assignment via registered-user email fields, composable task titles (form fields + assignee name), form branding (logo/banner), and public form links
- **Links & URLs** — Admin-curated links assigned to executives, with role-scoped visibility
- **Calendar** — Monthly grid view with priority-colored task pills
- **My Tasks** — Personal task view grouped by due date urgency
- **Personal To-Do List** — Sidebar widget with drag-and-drop reordering and completion animations
- **Celebration Effect** — Canvas particle animation on task completion
- **Dark Mode** — Full dark/light theme support with customizable primary color
- **UI/UX Polish** — ClickUp-inspired micro-interactions, animations, and hover feedback

See [FEATURES.md](FEATURES.md) for the complete feature list. These documents serve as the feature reference for the mobile app — the API is token-authenticated via Laravel Sanctum, and push notifications reach mobile devices through FCM (device tokens tracked per platform).

## Roles

| Role | Description |
|------|-------------|
| `admin` | Full system access |
| `user` | Standard user |
| `supervisor` | Team oversight + manage-tasks |
| `division_head` | Division-level oversight |
| `executive` | Executive committee — receives top-tier escalations |

## Environment

Key `.env` variables:

```env
# Mail (default: log — emails written to storage/logs/laravel.log)
MAIL_MAILER=log

# WebSockets
SOKETI_APP_ID=app-id
SOKETI_APP_KEY=app-key
SOKETI_APP_SECRET=app-secret

# AI (optional)
AI_PLATFORM=openai

# Push Notifications (optional)
FCM_SERVER_KEY=your-fcm-key

# CAPTCHA (required for public forms)
TURNSTILE_SECRET_KEY=your-turnstile-secret
TURNSTILE_SITE_KEY=your-turnstile-site-key
```

## License

Proprietary — internal use only.
