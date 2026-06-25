# WMT — Remaining Tasks & Future Features

## High Priority

### Task Enhancements
- [ ] File/image attachments on tasks
- [ ] Task dependencies (blocked-by / blocks relationships)
- [ ] Task labels/tags for categorization
- [ ] Task time tracking (log hours, estimates vs actuals)
- [ ] Task templates (reusable task structures)
- [ ] Bulk task actions (multi-select → change status, assign, delete)
- [ ] Task search and global search (across all projects)
- [ ] Task filters on Kanban board (by assignee, priority, due date, label)

### Project Enhancements
- [ ] Project templates (pre-defined task sets)
- [ ] Project progress dashboard (Gantt chart or timeline view)
- [ ] Project comments / discussion thread
- [ ] Project file attachments
- [ ] Project archiving workflow with confirmation

### Notification Improvements
- [ ] Email notification channel (currently database + broadcast only)
- [ ] User notification preferences (per-type opt-in/opt-out)
- [ ] Digest emails (daily/weekly summary)
- [ ] @mention notifications in comments
- [ ] Notification for task comments (notify assignee and collaborators)

## Medium Priority

### Reporting & Analytics
- [ ] Project-level reports (completion rates, burndown charts)
- [ ] User productivity reports (tasks completed, avg time to close)
- [ ] Department/team workload reports
- [ ] Export reports to CSV/PDF
- [ ] Custom date range filtering on dashboards

### AI Features
- [ ] AI task summarization
- [ ] Smart task assignment suggestions (based on workload and skills)
- [ ] AI-powered project status reports
- [ ] Natural language task creation
- [ ] Meeting notes → task extraction

### User Experience
- [ ] Keyboard shortcuts (navigate board, quick-create task)
- [ ] Drag-and-drop file upload on task edit
- [ ] Rich text editor for task descriptions and comments (Markdown or WYSIWYG)
- [ ] Mobile-responsive improvements for Kanban board
- [ ] Customizable Kanban column visibility (hide/show specific statuses)
- [ ] Task card customization (choose which fields to display)
- [ ] Saved views / filters per project
- [ ] Activity feed on dashboard — filter by project

### Calendar Improvements
- [ ] Week and day views (currently month only)
- [ ] Drag tasks to reschedule on calendar
- [ ] iCal/Google Calendar sync
- [ ] Color-coded by project (in addition to priority)

## Lower Priority

### Collaboration
- [ ] In-app chat / messaging between users
- [ ] Real-time collaborative editing on task descriptions
- [ ] Shared project notes / wiki pages
- [ ] Guest/external user access (read-only project sharing)

### Governance & Compliance
- [ ] Approval workflows (task status requires manager sign-off)
- [ ] Audit log (who changed what, when — exportable)
- [ ] SLA tracking (response time, resolution time)
- [ ] Risk register tied to projects
- [ ] Document management (policies, SOPs linked to projects)

### Integrations
- [ ] Slack/Teams webhook notifications
- [ ] GitHub/GitLab integration (link commits/PRs to tasks)
- [ ] Google Drive / OneDrive file linking
- [ ] API endpoints for third-party integrations
- [ ] Zapier/webhook triggers for task events

### Administration
- [ ] User activity log (login history, actions taken)
- [ ] System health dashboard (queue stats, WebSocket connections)
- [ ] Backup management UI
- [ ] Customizable roles and permissions (currently fixed seed)
- [ ] Onboarding wizard for new users
- [ ] User profile page (self-service update name, password, avatar)

### Performance & Scale
- [ ] Database query optimization (N+1 audit)
- [ ] Redis caching for frequently accessed data (project lists, user lists)
- [ ] Lazy loading for large task boards (virtual scrolling)
- [ ] Background job for recurring task generation (currently synchronous)
- [ ] Rate limiting on API endpoints

### Testing
- [ ] Unit tests for models and services
- [ ] Feature tests for controllers and policies
- [ ] Frontend component tests (React Testing Library)
- [ ] End-to-end tests (Cypress or Playwright)
- [ ] CI/CD pipeline setup

### Documentation
- [ ] API documentation (if public API is planned)
- [ ] User guide / help pages
- [ ] Admin setup guide
- [ ] Developer onboarding docs
