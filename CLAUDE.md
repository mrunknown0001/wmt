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

### Users (extended)
- Standard Laravel user fields
- `department` (string, nullable)
- `position` (string, nullable)
- `is_active` (boolean, default true)
- Roles via spatie `model_has_roles` pivot

### Permissions (Phase 1)
- `manage-users` — create/edit/delete users (admin)
- `view-users` — view user list (admin, executive, division_head, supervisor)
- `manage-roles` — assign roles (admin)

## Key Decisions
- Registration is open; new users get `user` role by default
- Admins assign elevated roles via user management UI
- Inactive users (`is_active = false`) are blocked at login
- Default admin seed: admin@wmt.com / password
- AI platform is switchable via `.env` — no AI service layer until a phase needs it

## Phase Status

### Phase 1: Auth + Roles + Permissions — COMPLETE
- Inertia.js + React configured
- Login, Register, Logout
- spatie roles & permissions seeded (5 roles, 3 permissions)
- User management CRUD (admin only)
- UserPolicy for authorization
- HandleInertiaRequests shares auth data (user, roles, permissions, flash)
- Sidebar nav with permission-based visibility

## Running
```bash
# Docker
docker compose up -d

# Migrate & seed
php artisan migrate --seed

# Dev server
npm run dev
# or
composer run dev   # runs php server + queue + pail + vite concurrently
```

## File Structure (Phase 1)
```
app/
├── Http/
│   ├── Controllers/
│   │   ├── Auth/
│   │   │   ├── LoginController.php
│   │   │   ├── LogoutController.php
│   │   │   └── RegisterController.php
│   │   ├── DashboardController.php
│   │   └── UserController.php
│   ├── Middleware/
│   │   └── HandleInertiaRequests.php
│   └── Requests/
│       ├── Auth/
│       │   ├── LoginRequest.php
│       │   └── RegisterRequest.php
│       ├── StoreUserRequest.php
│       └── UpdateUserRequest.php
├── Models/
│   └── User.php (HasRoles trait)
├── Policies/
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
│   └── Users/
│       ├── Index.jsx
│       ├── Create.jsx
│       └── Edit.jsx
database/
├── migrations/
│   ├── ...create_permission_tables.php (spatie)
│   └── ...add_profile_fields_to_users_table.php
├── seeders/
│   ├── DatabaseSeeder.php
│   └── RolePermissionSeeder.php
```
