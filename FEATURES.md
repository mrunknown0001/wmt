# WMT — Features

## Authentication & User Management
- Login/logout with session-based auth (public registration disabled)
- Inactive users blocked at login (`is_active` flag)
- Admin-only user CRUD (create, edit, delete)
- 5 roles: admin, user, supervisor, division_head, executive
- 13 granular permissions via spatie/laravel-permission
- Role-based sidebar visibility and route authorization
- API authentication via Laravel Sanctum (token-based, supports mobile clients)

## Organization Hierarchy
- **Divisions** — top-level org unit with optional head (user)
- **Departments** — belong to a division, with optional head
- **Teams** — belong to a department, with optional leader
- Users belong to one department + optionally one team
- Full CRUD for all three org entities with policy-based access
- Cascade deletes: division → departments → teams

## Projects
- Full CRUD — any authenticated user can create projects
- Statuses: active, on_hold, completed, archived
- Project owner + project admin/co-owner member role
- Project members with roles (viewer, editor, admin)
- Task count and completion stats on index
- Due date tracking
- Search and status filtering on index page (paginated)
- Owner, project admins, and manage-projects permission holders can edit
- **Archived projects view** — dedicated page for viewing, unarchiving, and permanently deleting archived projects

## Tasks
- Full CRUD nested under projects
- Statuses: backlog, to_do, in_progress, in_review, done, cancelled
- Priorities: low, medium, high, urgent
- Assignee and creator tracking
- Start date and due date with overdue detection
- Subtasks (self-referential parent_id) with progress tracking
- Collaborators (many-to-many with users)
- Position-based ordering within status columns
- Rich text descriptions via TipTap WYSIWYG editor

### Task Attachments
- Direct file attachments on tasks (separate from comment attachments)
- Metadata tracked: file name, path, type, size
- File type detection helpers (image, video, spreadsheet)
- Cascades on task deletion

### Task Sections
- Asana-style sections for grouping tasks within a project
- Create, rename, reorder, and delete sections
- Drag-and-drop section reordering
- Tasks organized within sections on the board

### Kanban Board (Projects/Show)
- Dual view toggle: Kanban board and list view
- Drag-and-drop cards between columns and within columns (@dnd-kit)
- Inline field editing: status, priority, assignee, due date — all via PATCH endpoint
- Toggle complete button (circle checkbox) on each card
- Delete task with confirmation modal
- Subtask progress indicator (completed/total)
- Collaborator avatars stacked on cards
- Priority and status badges
- Sticky header for scrollable boards
- Collapsible project details panel

### Inline Editing Components
- **StatusPicker** — popover dropdown for quick status changes
- **PriorityPicker** — popover dropdown for quick priority changes
- **AssigneePicker** — searchable user popover with avatar display
- **InlineDatePicker** — custom calendar grid popover with clear date support
- **InlineCustomFieldEditor** — inline editing for all 5 custom field types in list view

### Celebration Effect
- Canvas particle animation triggered on task completion (checkbox click)
- 45 particles with 3 shape types: stars (with rotation and glow), sparkles (with trails), confetti (rectangular, fluttering)
- Physics simulation with gravity, drag, velocity, and rotation
- Expanding ring animation
- Auto-cleanup after ~1.5s animation completes

### Task Activity Tracking
- Automatic change logging for 6 fields (title, description, status, priority, assigned_to, due_date)
- Old/new values stored with human-readable formatting
- Activity feed on task edit page

### Task Comments
- Add/delete comments on tasks
- Rich text comments with TipTap editor (bold, italic, underline, lists, links)
- **@mentions** — mention users in comments with searchable autocomplete dropdown (triggers notification)
- **File attachments** on comments — up to 5 files per comment with size tracking; supports images, videos, spreadsheets
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

## Custom Fields
- 5 field types: text, number, date, single select, multi select
- Per-project field definitions with position-based ordering
- Single/multi select fields support colored options with scrollable list
- Custom field values stored per task with typed columns (text, number, date, option ID, JSON)
- Inline editing of all field types directly in the task list view
- Custom field columns displayed in list view with sortable headers
- Auto-focus and scroll-to-new-option when adding select options
- Styled scrollbars on option lists

## Form Builder & Public Forms
- **Asana-style two-tab layout** — Questions tab and Settings tab
- **9 field types**: text, textarea, number, date, select, multi select, attachment, heading, description
- **Drag-and-drop field reordering** via @dnd-kit with visual feedback
- **Expandable field configuration**: label, help text, default value, required, visible on form, maps-to
- **Default values** per field — type-appropriate inputs (text, number, date picker, select dropdown)
- **Visibility toggle** — hidden fields use default values silently when form is submitted
- **Conditional visibility** — form fields support conditional display rules based on other field values
- **"Add from Custom Fields" modal** — browse project custom fields with type icons, option previews, and checkbox selection
- **Settings tab**:
  - Section selector — assign submitted tasks to a project section
  - Task title field selector — multi-select dropdown to compose task titles from multiple form fields
- Form fields mappable to task description or custom fields
- Select/multi select fields inherit options from mapped custom fields (displayed read-only)
- Static options editor for unmapped select fields
- **Attachment field type** — images, videos, Excel files; up to 5 files per submission, 50MB per file
- Portal-based floating dropdowns with dynamic up/down positioning based on viewport space
- Public form URLs via UUID — no authentication required
- Turnstile (CAPTCHA) protection on public form submissions
- Rate limiting on submissions (throttle:10,1)
- Form active/inactive toggle — inactive forms return 404
- Public form submissions create tasks with:
  - Custom title composed from selected fields
  - Custom field values populated
  - File attachments linked to task
  - Section assignment from form defaults
- Configurable submit button text and success message
- Styled scrollbars on modals and dropdown lists

## Global Search
- Search across projects, tasks, and users from any page
- Minimum 2 character query
- Keyboard navigation (arrow keys, Enter to select)
- Returns up to 20 results per category
- Accessible from the header/navbar

## AI Chat Assistant
- Floating chat widget accessible from any page
- Multi-turn streaming conversations via Server-Sent Events (SSE)
- Context-aware — understands organizational structure, tasks, and workload
- Auto-generated conversation titles from first message
- Conversation history with list view, switch, and delete
- Follow-up prompt suggestions (auto-parsed from AI responses)
- Message limit enforcement (10 messages per conversation)
- Configurable AI platform via `AI_PLATFORM` env var (OpenAI / OpenRouter)

## Personal To-Do List
- Sidebar widget accessible in both expanded and collapsed sidebar modes
- Add, complete, and delete personal to-dos
- Drag-and-drop reordering via @dnd-kit (modal view)
- Completion animation with fade-out effect
- Expandable modal view with full list management
- Show/hide completed items toggle
- Clear completed and clear all actions with confirmation modals
- Clear all closes modal automatically
- Close (X) button on modal
- Styled scrollbars matching app theme
- Badge count for incomplete items on sidebar icon
- Popover view when sidebar is collapsed
- Optimistic UI updates with API rollback on failure

## Workflow Automation Rules
- Project-level rule builder accessible from project show page
- Define custom rules: trigger → conditions → actions
- **Triggers**: task created, status changed, priority changed, task assigned, task completed
- **Configurable trigger parameters** — JSON-based trigger configuration for granular control
- **Conditions**: filter by status, priority, assigned user, section (with equals/not_equals/in/not_in operators)
- **Actions**: change status, change priority, assign user, move to section, send notification
- Toggle rules active/inactive
- Infinite loop prevention (rules don't re-trigger from rule-caused changes)
- Only visible to project owners, admins, and manage-tasks permission holders

## Dashboard
- Personalized with 7 togglable widgets (persisted per-user via `dashboard_preferences`)
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
- My Projects & Involved Projects sections

## Executive Dashboard
- Organization-wide statistics and drill-down views
- Hierarchical navigation: Org Overview → Division → Department → Team
- Aggregate task/project metrics at each level
- Accessible to admin, supervisor, division_head, and executive roles

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

## Centralized Activity Log
- Org-wide audit trail across all projects and tasks
- Tracks user actions with entity type, entity name, and field-level changes (old/new values)
- Filterable and searchable activity history
- Accessible from sidebar navigation

## Notifications
- **Real-time** via Soketi (Pusher-protocol WebSockets) + Laravel Echo
- Private channel per user (`App.Models.User.{id}`)
- 8 notification types:
  - **Task Assigned** — when assigned to a task or reassigned
  - **Task Due Soon** — for tasks due tomorrow (scheduled daily at 08:00)
  - **Task Overdue** — for past-due active tasks (scheduled daily at 08:00)
  - **Task Comment** — when someone comments on your task
  - **Task Mention** — when @mentioned in a comment
  - **Comment Deleted** — when a comment mentioning you is deleted
  - **Task Escalated** — tiered overdue escalation (see below)
  - **Task Due Reminder** — recurring due date reminders
- Notification bell with unread count badge
- Dropdown preview (last 5 notifications)
- Full inbox page (paginated, 15/page) with 5 filter tabs: Inbox, Unread, Bookmarked, Mentions, Archived
- **Bookmark** — toggle bookmark on any notification for quick access later (amber bookmark icon)
- **Archive** — archive notifications to remove from main inbox; unarchive from Archived tab
- **Mentioned filter** — view only notifications where you were @mentioned in comments
- Mark individual or all as read
- Audio chime on new notification (Web Audio API)
- Toast notification popup (top-right, auto-dismiss 5s)
- Deduplication — won't double-notify same task same day

### Push Notifications (FCM)
- Web push notifications via Firebase Cloud Messaging
- Device token registration and management per user
- Platform tracking (web/mobile)
- Automatic FCM dispatch on all database notification events

### Email Notifications
- All notification types support queued email delivery (`ShouldQueue`)
- Per-user notification preferences with toggle switches
- Preferences page accessible from sidebar (Settings → Notifications)
- Defaults: all on except comment_deleted
- Mail driver configurable via `.env` (`MAIL_MAILER=log` for development)

### Escalated Due Date Notifications
- Tiered escalation for overdue tasks, traversing org hierarchy:
  - **Level 1** (1 day overdue) — Assignee reminder
  - **Level 2** (3 days overdue) — Team leader + Project owner
  - **Level 3** (7 days overdue) — Department head
  - **Level 4** (14 days overdue) — Division head + all executive-role users
- Escalation level tracked per task (`escalation_level` column)
- Only escalates upward (won't re-send for same level)
- Resets to 0 when task is completed or cancelled
- Configurable tier thresholds in `Task::ESCALATION_TIERS`
- Runs daily via `tasks:send-reminders` scheduled command

## Theme & Settings
- Dark/light mode toggle (persisted to localStorage)
- Full dark mode support across all components (Tailwind `dark:` utilities)
- Admin-configurable app name (displayed in sidebar and page title)
- Admin-configurable primary color — 8 named palettes (blue, indigo, violet, teal, green, red, orange, rose) with 10 shades each
- Applied via CSS custom properties (`--color-primary-*`)
- Settings cached in Redis

## UI/UX Polish
- **Animation system** — CSS custom properties for timing tokens (`--duration-fast/normal/slow`, easing curves) and 9 reusable keyframe animations
- **Button press feedback** — `active:scale-[0.97]` shrink on click, `focus-visible` rings (keyboard-only)
- **Modal animations** — scale-in entrance, scale-out exit with backdrop fade
- **Popover/dropdown animations** — slide-down entrance on status pickers, priority pickers, assignee pickers, search results, and form builder dropdowns
- **Card hover lift** — task cards translate up 1px with enhanced shadow on hover
- **List row accent bars** — primary-colored left bar appears on hover for project list rows and dashboard items
- **Sidebar active indicator** — 3px primary-colored vertical bar on the active nav item
- **Collapsed sidebar tooltips** — styled hover tooltips on collapsed nav icons (replaces browser-default `title`)
- **Icon hover scale** — sidebar action buttons (logout, hamburger, theme toggle) scale up with spring easing on hover
- **Flash message animations** — slide-in from right on appear, slide-out on dismiss/auto-expire
- **Styled horizontal scrollbar** — slim 6px scrollbar for list view, calendar, and Gantt containers; hidden until hover
- **Global cursor:pointer** — all interactive elements (buttons, links, selects, labels) show pointer cursor
- **Reusable components** — `Tooltip` (4-position hover tooltip), `Skeleton`/`SkeletonCard`/`SkeletonRow` (shimmer loading placeholders)

## Technical Infrastructure
- Docker Compose dev environment (Laravel, MySQL, Redis, Soketi, phpMyAdmin)
- Inertia.js SSR with React (JSX)
- Tailwind CSS v4 for styling
- TipTap WYSIWYG rich text editor with @mention support
- @dnd-kit for drag-and-drop interactions (Kanban, form builder, to-do list, sections)
- Laravel Sanctum for API token authentication (web + mobile)
- Cloudflare Turnstile CAPTCHA integration
- CSRF-protected API fetches
- Policy-based authorization on all resources
- Form request validation on all create/update operations
- Queued notifications via Redis
- Firebase Cloud Messaging for push notifications
- Server-Sent Events for AI chat streaming
- HandleInertiaRequests middleware shares auth data, settings, unread count, flash messages
- SearchableSelect reusable component for user pickers
- Portal-based floating dropdowns for consistent z-index behavior
- Custom styled scrollbars for modals, dropdowns, and horizontal overflow containers
- Scheduled commands for task reminders and escalation (`tasks:send-reminders`)
