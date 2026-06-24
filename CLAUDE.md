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

### Permissions
- `manage-users`, `view-users`, `manage-roles`
- `manage-divisions`, `view-divisions`
- `manage-departments`, `view-departments`
- `manage-teams`, `view-teams`

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

## Phase Status

### Phase 1: Auth + Roles + Permissions — COMPLETE
- Inertia.js + React configured
- Login, Logout (registration disabled — users created via admin panel)
- spatie roles & permissions seeded (5 roles, 3 permissions)
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

## Running
```bash
# Docker
docker compose up -d

# Fresh migrate & seed (required after Phase 2 — schema changed)
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
│   │   ├── TeamController.php
│   │   └── UserController.php
│   ├── Middleware/
│   │   └── HandleInertiaRequests.php
│   └── Requests/
│       ├── Auth/
│       │   ├── LoginRequest.php
│       │   └── RegisterRequest.php
│       ├── Store{Division,Department,Team,User}Request.php
│       └── Update{Division,Department,Team,User}Request.php
├── Models/
│   ├── Department.php
│   ├── Division.php
│   ├── Team.php
│   └── User.php
├── Policies/
│   ├── DepartmentPolicy.php
│   ├── DivisionPolicy.php
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
│   └── ...update_users_table_org_structure.php
├── seeders/
│   ├── DatabaseSeeder.php
│   ├── OrganizationSeeder.php
│   └── RolePermissionSeeder.php
```
