# WMT — Features

## Authentication & User Management
- Login/logout with session-based auth (public registration disabled)
- Inactive users blocked at login (`is_active` flag)
- Admin-only user CRUD (create, edit, delete)
- 5 roles: admin, user, supervisor, division_head, executive
- 13 granular permissions via spatie/laravel-permission
- Role-based sidebar visibility and route authorization

## Organization Hierarchy
- **Divisions** — top-level org unit with optional head (user)
- **Departments** — belong to a division, with optional head
- **Teams** — belong to a department, with optional leader
- Users belong to one department + optionally one team
- Full CRUD for all three org entities with policy-based access
- Cascade deletes: division → departments → teams

## Projects
- Full CRUD with owner assignment
- Statuses: active, on_hold, completed, archived
- Project members with roles (viewer, editor)
- Task count and completion stats on index
- Due date tracking
- Search and status filtering on index page (paginated)
- Owner and manage-projects permission holders can edit

## Tasks
- Full CRUD nested under projects
- Statuses: backlog, to_do, in_progress, in_review, done, cancelled
- Priorities: low, medium, high, urgent
- Assignee and creator tracking
- Due date with overdue detection
- Subtasks (self-referential parent_id)
- Collaborators (many-to-many with users)
- Position-based ordering within status columns

### Kanban Board (Projects/Show)
- Dual view toggle: Kanban board and list view
- Drag-and-drop cards between columns and within columns (@dnd-kit)
- Inline field editing: status, priority, assignee, due date — all via PATCH endpoint
- Toggle complete button (circle checkbox) on each card
- Delete task with confirmation modal
- Subtask progress indicator (completed/total)
- Collaborator avatars stacked on cards
- Priority and status badges

### Inline Editing Components
- **StatusPicker** — popover dropdown for quick status changes
- **PriorityPicker** — popover dropdown for quick priority changes
- **AssigneePicker** — searchable user popover with avatar display
- **InlineDatePicker** — custom calendar grid popover with clear date support

### Task Activity Tracking
- Automatic change logging for 6 fields (title, description, status, priority, assigned_to, due_date)
- Old/new values stored with human-readable formatting
- Activity feed on task edit page

### Task Comments
- Add/delete comments on tasks
- Combined timeline view with activities (sorted by date)
- Paginated loading (offset-based, 10 per page)
- Filter tabs: All, Comments, Activity

### Recurring Tasks
- Toggle any top-level task as recurring
- Frequencies: daily, weekly, monthly, yearly with configurable interval (1–365)
- Next occurrence auto-created when task marked as done
- Due date calculated from previous occurrence
- Linked chain via `recurring_source_id` — full history browsable
- Works across all status-change paths: form save, inline patch, Kanban drag
- Recurrence chain visualization tab on task edit page
- Recurring icon displayed on task cards
- Collaborators synced to new occurrence
- Guards against duplicate generation

## Dashboard
- Personalized with 7 togglable widgets (persisted per-user)
- Time-of-day greeting
- 4 stat cards: Total Projects, Active Projects, My Tasks, Overdue Tasks
- Due Today & Overdue alert panel
- Recent Projects list with progress bars
- My Upcoming Tasks list
- Task stats bar (completed this week, due today, by-status breakdown)
- Donut chart — tasks by status (custom SVG)
- Bar chart — tasks by priority (custom SVG)
- Activity feed (recent task changes)
- Team workload view (admin/supervisor only — ranked by open task count)
- Quick action button (New Project)

## My Tasks Page
- All tasks assigned to current user
- Grouped into 5 sections: overdue, due today, upcoming (7 days), later, no due date
- Filter tabs by status and priority
- Stats bar with totals and overdue count

## Calendar
- Monthly grid view (Sunday-start with overflow days)
- Task pills colored by priority
- Up to 3 tasks per day with "+N more" overflow
- Month navigation with jump-to-today
- Tasks link to their edit page

## Notifications
- **Real-time** via Soketi (Pusher-protocol WebSockets) + Laravel Echo
- Private channel per user (`App.Models.User.{id}`)
- Three notification types:
  - **Task Assigned** — when assigned to a task or reassigned
  - **Task Due Soon** — for tasks due tomorrow (scheduled daily at 08:00)
  - **Task Overdue** — for past-due active tasks (scheduled daily at 08:00)
- Notification bell with unread count badge
- Dropdown preview (last 5 notifications)
- Full inbox page (paginated, 15/page)
- Mark individual or all as read
- Audio chime on new notification (Web Audio API)
- Toast notification popup (top-right, auto-dismiss 5s)
- Deduplication — won't double-notify same task same day

## Theme & Settings
- Dark/light mode toggle (persisted to localStorage)
- Full dark mode support across all components (Tailwind `dark:` utilities)
- Admin-configurable app name (displayed in sidebar and page title)
- Admin-configurable primary color — 8 named palettes (blue, indigo, violet, teal, green, red, orange, rose) with 10 shades each
- Applied via CSS custom properties (`--color-primary-*`)
- Settings cached in Redis

## Technical Infrastructure
- Docker Compose dev environment (Laravel, MySQL, Redis, Soketi, phpMyAdmin)
- Inertia.js SSR with React (JSX)
- Tailwind CSS v4 for styling
- CSRF-protected API fetches
- Policy-based authorization on all resources
- Form request validation on all create/update operations
- Queued notifications
- HandleInertiaRequests middleware shares auth data, settings, unread count, flash messages
