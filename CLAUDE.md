# WMT — Workload Management Tool

### ignore

## Project Overview
Operational workload management platform (Asana-like task management + operational governance). Built in phases.

## Stack
- **Backend**: Laravel 13 (PHP 8.3+)
- **Frontend**: Inertia.js + React (JSX)
- **Database**: MySQL 8.0
- **Cache/Sessions/Queues**: Redis
- **WebSockets**: Soketi (Pusher-protocol)
- **Real-time client**: Laravel Echo
- **Auth/Permissions**: spatie/laravel-permission
- **Styling**: Tailwind CSS v4
- **AI**: OpenAI / OpenRouter (configurable via `AI_PLATFORM` env var)
- **Dev environment**: Docker Compose (Laravel, MySQL, Redis, Soketi, phpMyAdmin)

## Roles
`admin`, `user`, `supervisor`, `division_head`, `executive` (execom)

## Schema

### Users
- Standard Laravel user fields
- `position` (string, nullable)
- `department_id` (FK → departments, nullable)
- `team_id` (FK → teams, nullable)
- `is_active` (boolean, default true)
- Roles via spatie `model_has_roles` pivot

### Divisions
- `name`, `description`, `head_id` (FK → users, nullable)
- Has many departments

### Departments
- `name`, `description`, `division_id` (FK → divisions), `head_id` (FK → users, nullable)
- Has many teams, has many users

### Teams
- `name`, `description`, `department_id` (FK → departments), `leader_id` (FK → users, nullable)
- Has many members (users)

### Org Hierarchy
Division → Department → Team → Users (fixed hierarchy)

### Projects
- `name`, `description`, `status` (active/on_hold/completed/archived), `owner_id` (FK → users, nullable), `due_date`
- Has many tasks

### Tasks
- `project_id` (FK → projects, cascadeOnDelete), `title`, `description`
- `status` (backlog/to_do/in_progress/in_review/done/cancelled), `priority` (low/medium/high/urgent)
- `assigned_to` (FK → users, nullable), `created_by` (FK → users, nullable), `due_date`, `position`

### Links
- `title` (string), `description` (text, nullable), `url` (string 2048, nullable)
- `user_id` (FK → users, cascadeOnDelete) — assigned user
- `created_by` (FK → users, nullable, nullOnDelete) — admin who created it
- Links are restricted to admins and executives: admins manage all links; executives see only their own assigned links; normal users have no access

### Folders
- `name`, `parent_id` (FK → folders, nullable, cascadeOnDelete), `position`
- `depth` (absolute level), `user_depth` (nullable; null = system folder, 0–4 = user folder nesting), `path` (materialized id path, e.g. `/1/5/13/`)
- `source_type`/`source_id` (nullable morph → Division/Department/Team; set = system folder), `created_by` (FK → users, nullable)
- `projects.folder_id` (FK → folders, nullable, nullOnDelete)
- System folders auto-mirror the org tree via observers (division at root → department → team); renames/re-parents sync automatically; `php artisan folders:sync` backfills
- Deleting an org entity or user folder promotes contained projects/subfolders to the parent folder (never deletes them)
- User folders: max 5 levels (`user_depth` 0–4), nesting resets under each system folder; only creator or manage-projects can rename/move/delete
- Visibility (FolderService): admins see all; others see their own org chain, subtrees they head/lead, folders they created, folders holding their visible projects (+ ancestors)
- Heads/leaders get read access to projects filed in their org folder subtree (ProjectPolicy::view + project index queries)

### Permissions
- `manage-users`, `view-users`, `manage-roles`
- `manage-divisions`, `view-divisions`
- `manage-departments`, `view-departments`
- `manage-teams`, `view-teams`
- `manage-projects`, `view-projects`
- `manage-tasks`, `view-tasks`
- `manage-links`, `view-links`

## Key Decisions
- Public registration is disabled; new users are created by admins/privileged users via user management UI
- Inactive users (`is_active = false`) are blocked at login
- Default admin seed: admin@wmt.com / password
- AI platform is switchable via `.env` — no AI service layer until a phase needs it
- Org hierarchy: Division → Department → Team (fixed, not configurable)
- Users belong to one department + optionally one team
- Division/department heads and team leaders are nullable user references
- Deleting a division cascades to departments and teams
- Deleting a department cascades to teams
- User team dropdown filters by selected department
- Projects have flexible ownership — any active user can be assigned tasks
- Project owners can edit their project and manage tasks within it
- Task assignees can update their own tasks (status changes, etc.)
- Deleting a project cascades to its tasks

## Phase Status

### Phase 1: Auth + Roles + Permissions — COMPLETE
- Inertia.js + React configured
- Login, Logout (registration disabled — users created via admin panel)
- spatie roles & permissions seeded (5 roles, 9 permissions — Phase 2 added 6, Phase 3 added 4)
- User management CRUD (admin only)
- UserPolicy for authorization
- HandleInertiaRequests shares auth data (user, roles, permissions, flash)
- Sidebar nav with permission-based visibility

### Phase 2: Teams / Departments & Divisions — COMPLETE
- Division, Department, Team models with typed relationships
- 4 migrations (divisions, departments, teams, user org FKs)
- Replaced string `department` on users with `department_id` + `team_id` FKs
- Policies for all three org entities
- CRUD controllers with Form Requests for divisions, departments, teams
- 6 new permissions (manage/view for each org entity)
- OrganizationSeeder with sample data (3 divisions, 6 departments, 6 teams)
- Frontend: Index/Create/Edit pages for divisions, departments, teams
- User forms updated with department/team dropdowns (team filters by department)
- Sidebar organized into "Organization" and "Administration" sections

### Phase 3: Projects & Tasks — COMPLETE
- Project and Task models with full relationships
- 2 migrations (projects, tasks)
- 4 new permissions (manage-projects, view-projects, manage-tasks, view-tasks)
- All roles get view-projects/view-tasks; supervisor gets manage-tasks; admin gets all
- ProjectPolicy: create/delete for manage-projects; update for manage-projects OR owner
- TaskPolicy: create for manage-tasks OR project owner; update adds assignee; delete for manage-tasks OR owner
- ProjectController with full CRUD including show (task board)
- TaskController nested under projects (create/store/edit/update/destroy)
- Frontend: Projects Index/Create/Edit/Show; Tasks Create/Edit
- Project show page displays task list with status/priority badges
- Project show page has 5 view modes: List, Board, Calendar, Gantt, Dashboard
- Dashboard view shows project analytics computed client-side from loaded tasks:
  - Summary cards: Total Tasks (with completion progress bar), Completed, In Progress, Overdue
  - Status breakdown: stacked bar chart + legend with counts/percentages per status
  - Priority breakdown: progress bars for urgent/high/medium/low (active tasks only)
  - Due date overview: Overdue, Due Today, Due This Week, No Due Date cards
  - Assignee workload: table with total/active/done/overdue per assignee + progress bar
- Sidebar updated with Projects link (visible to all authenticated users)
- Task statuses: backlog, to_do, in_progress, in_review, done, cancelled
- Task priorities: low, medium, high, urgent
- Project statuses: active, on_hold, completed, archived

### Phase 4: Custom Fields & Form Builder — COMPLETE
- Custom fields on projects (text, number, date, single_select, multi_select)
- 5 new models: CustomField, CustomFieldOption, TaskCustomFieldValue, Form, FormField
- 5 migrations (custom_fields, custom_field_options, task_custom_field_values, forms, form_fields)
- CustomFieldController (JSON API) for CRUD + reorder, nested under projects
- TaskCustomFieldValueController for updating custom field values on tasks
- FormController (Inertia) for form builder CRUD, nested under projects
- PublicFormController for public form display + submission (no auth)
- Form builder with field palette, mapping to custom fields or task title/description
- Task defaults on forms (status, priority, assignee, section)
- Public form submissions create tasks with custom field values populated
- Turnstile protection on public forms (reuses existing Turnstile rule + config)
- Rate limiting on public form submissions (throttle:10,1)
- Frontend: CustomFieldManager, CustomFieldValueEditor, FormBuilder, TurnstileWidget components
- Frontend: Forms Index/Create/Edit pages, PublicForm + PublicFormSuccess pages
- Custom field values integrated into Task Create/Edit pages
- Custom Fields panel on Project Show page
- No new permissions (inherits project-level authorization)

### Phase 6: Project Folders — COMPLETE
- Folder model (materialized path tree) + folders migration + `projects.folder_id`
- System folders auto-created/synced/removed by Division/Department/Team observers; `folders:sync` command backfills
- FolderService: org sync, subtree promotion on delete, overseen/visible folder id resolution with per-request cache
- FolderPolicy (system folders immutable via UI), FolderController (store/update/move/destroy with depth + cycle validation)
- ProjectController: Folders view (`view=folders&folder=id|root`), folder tree prop with visible-project counts, moveToFolder endpoint, default folder = creator's team folder (fallback department)
- Head/leader read visibility wired into index/archived/show/ProjectPolicy
- Frontend: FolderTree (expand/collapse persisted, hover actions, drag-drop targets), FolderNameModal, MoveToFolderModal, Projects Index tabs (All Projects | Folders) with tree pane + breadcrumb, Folder column chip in All view, folder picker on project Create/Edit
- No new permissions (create folders: any user; manage: creator or manage-projects)

### Project Dashboard Charts — COMPLETE
- ProjectChart model + project_charts migration (title, chart_type, group_by, config JSON, position, created_by)
- Chart types: bar (HTML horizontal bars), donut (SVG ring), line (SVG, weekly/monthly time buckets)
- Dimensions: status, priority, assignee, section, single-select custom field (bar/donut); completed/created/due over time (line); scope filter (all/active/done)
- ProjectChartController (JSON API: store/update/destroy) nested under projects
- Chart management access: admins (manage-projects or admin role), executives (all projects), project owner, project admin members; charts visible to anyone who can view the dashboard
- Executives granted read access across all projects (ProjectPolicy::view, project index/archived listings, full task visibility on show) so chart access works org-wide
- Frontend: ProjectCharts component (chart cards + add/edit modal + delete confirm) rendered at the bottom of the project Show dashboard view; charts computed client-side from loaded tasks
- Colorblind-safe categorical palette via CSS vars (light/dark); app status/priority colors reused for those dimensions

### Phase 5: Links & URLs — COMPLETE
- Link model with user assignment (title, description, URL per record)
- 1 migration (links table)
- 2 new permissions (manage-links, view-links)
- Admin gets manage-links + view-links; executive gets view-links
- LinkPolicy: requires view-links to access; admins (manage-links) can CRUD all links; executives (view-links) view only their own
- LinkController with full CRUD, admin user filter, search
- Frontend: Links Index/Create/Edit pages
- URLs rendered as clickable links opening in new tabs
- Sidebar "Links & URLs" nav item visible only to users with view-links (admin, executive)

## Running
```bash
# Docker
docker compose up -d

# Fresh migrate & seed (required after Phase 3 — schema changed)
php artisan migrate:fresh --seed

# Dev server
npm run dev
# or
composer run dev   # runs php server + queue + pail + vite concurrently
```

## File Structure
```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Auth/
│   │   │   ├── LoginController.php
│   │   │   ├── LogoutController.php
│   │   │   └── RegisterController.php
│   │   ├── DashboardController.php
│   │   ├── DepartmentController.php
│   │   ├── DivisionController.php
│   │   ├── CustomFieldController.php
│   │   ├── LinkController.php
│   │   ├── FormController.php
│   │   ├── PublicFormController.php
│   │   ├── TaskCustomFieldValueController.php
│   │   ├── ProjectController.php
│   │   ├── TaskController.php
│   │   ├── TeamController.php
│   │   └── UserController.php
│   ├── Middleware/
│   │   └── HandleInertiaRequests.php
│   └── Requests/
│       ├── Auth/
│       │   ├── LoginRequest.php
│       │   └── RegisterRequest.php
│       ├── Store{Division,Department,Team,User,Project,Task,CustomField,Form,Link}Request.php
│       └── Update{Division,Department,Team,User,Project,Task,CustomField,Form,Link}Request.php
├── Models/
│   ├── CustomField.php
│   ├── CustomFieldOption.php
│   ├── Department.php
│   ├── Division.php
│   ├── Form.php
│   ├── FormField.php
│   ├── Link.php
│   ├── Project.php
│   ├── Task.php
│   ├── TaskCustomFieldValue.php
│   ├── Team.php
│   └── User.php
├── Policies/
│   ├── DepartmentPolicy.php
│   ├── DivisionPolicy.php
│   ├── LinkPolicy.php
│   ├── ProjectPolicy.php
│   ├── TaskPolicy.php
│   ├── TeamPolicy.php
│   └── UserPolicy.php
resources/js/
├── app.jsx
├── Layouts/
│   ├── AuthenticatedLayout.jsx
│   └── GuestLayout.jsx
├── Pages/
│   ├── Auth/
│   │   ├── Login.jsx
│   │   └── Register.jsx
│   ├── Dashboard.jsx
│   ├── Departments/
│   │   ├── Index.jsx, Create.jsx, Edit.jsx
│   ├── Divisions/
│   │   ├── Index.jsx, Create.jsx, Edit.jsx
│   ├── Projects/
│   │   ├── Index.jsx, Create.jsx, Edit.jsx, Show.jsx
│   ├── Tasks/
│   │   ├── Create.jsx, Edit.jsx
│   ├── Forms/
│   │   ├── Index.jsx, Create.jsx, Edit.jsx, PublicForm.jsx, PublicFormSuccess.jsx
│   ├── Links/
│   │   ├── Index.jsx, Create.jsx, Edit.jsx
│   ├── Teams/
│   │   ├── Index.jsx, Create.jsx, Edit.jsx
│   └── Users/
│       ├── Index.jsx, Create.jsx, Edit.jsx
database/
├── migrations/
│   ├── ...create_permission_tables.php (spatie)
│   ├── ...add_profile_fields_to_users_table.php
│   ├── ...create_divisions_table.php
│   ├── ...create_departments_table.php
│   ├── ...create_teams_table.php
│   ├── ...update_users_table_org_structure.php
│   ├── ...create_projects_table.php
│   ├── ...create_tasks_table.php
│   ├── ...create_custom_fields_table.php
│   ├── ...create_custom_field_options_table.php
│   ├── ...create_task_custom_field_values_table.php
│   ├── ...create_forms_table.php
│   ├── ...create_form_fields_table.php
│   └── ...create_links_table.php
├── seeders/
│   ├── DatabaseSeeder.php
│   ├── OrganizationSeeder.php
│   └── RolePermissionSeeder.php
```
