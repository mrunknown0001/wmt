# WMT — Workload Management Tool

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
- Admins manage all links; users see only their own assigned links

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

### Phase 5: Links & URLs — COMPLETE
- Link model with user assignment (title, description, URL per record)
- 1 migration (links table)
- 2 new permissions (manage-links, view-links)
- Admin gets manage-links + view-links; executive gets view-links
- LinkPolicy: admins can CRUD all links; users can only view their own
- LinkController with full CRUD, admin user filter, search
- Frontend: Links Index/Create/Edit pages
- URLs rendered as clickable links opening in new tabs
- Sidebar "Links & URLs" nav item visible to all authenticated users

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
