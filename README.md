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
| Auth/Permissions | spatie/laravel-permission |
| Styling | Tailwind CSS v4 |
| Rich Text | TipTap (WYSIWYG editor) |
| Drag & Drop | @dnd-kit |
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
- **Project Management** — Full CRUD with owner/admin roles, member management
- **Kanban Board** — Drag-and-drop task cards with inline editing and dual view (board/list)
- **Task Sections** — Asana-style grouping within projects
- **Subtasks** — Hierarchical parent-child tasks with progress tracking
- **Recurring Tasks** — Daily/weekly/monthly/yearly with auto-generation
- **Comments & @Mentions** — Rich text comments with user mentions and file attachments
- **Real-time Notifications** — WebSocket push + email (8 types, per-user preferences)
- **Escalated Due Dates** — Tiered overdue escalation through org hierarchy
- **Workflow Automation** — Project-level rule builder (trigger → conditions → actions)
- **AI Chat Assistant** — Streaming multi-turn conversations with organizational context
- **Executive Dashboard** — Org-wide stats with hierarchical drill-down
- **Customizable Dashboard** — 7 togglable widgets, persisted per user
- **Activity Log** — Centralized audit trail across all projects
- **Custom Fields** — 5 types (text, number, date, single select, multi select) per project with inline editing
- **Form Builder** — Asana-style form designer with tabs (Questions/Settings), drag-and-drop, custom field mapping, file attachments, and public form links
- **Calendar** — Monthly grid view with priority-colored task pills
- **My Tasks** — Personal task view grouped by due date urgency
- **Personal To-Do List** — Sidebar widget with drag-and-drop reordering and completion animations
- **Celebration Effect** — Canvas particle animation on task completion
- **Dark Mode** — Full dark/light theme support with customizable primary color

See [FEATURES.md](FEATURES.md) for the complete feature list.

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
```

## License

Proprietary — internal use only.
