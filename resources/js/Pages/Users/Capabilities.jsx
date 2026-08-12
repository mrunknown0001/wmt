import { Link, usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import Card from '../../Components/Card';
import Avatar from '../../Components/Avatar';

const humanize = (s) => String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

const CheckIcon = () => (
    <svg className="h-4 w-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
    </svg>
);

const DashIcon = () => (
    <svg className="h-4 w-4 text-gray-300 dark:text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14" />
    </svg>
);

function Chip({ children, tone = 'gray' }) {
    const tones = {
        gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
        blue: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
        green: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-300',
        amber: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${tones[tone]}`}>{children}</span>;
}

function Tile({ label, value, tone = 'gray' }) {
    const tones = {
        gray: 'text-gray-900 dark:text-gray-100',
        blue: 'text-blue-600 dark:text-blue-400',
        green: 'text-green-600 dark:text-green-400',
        amber: 'text-amber-600 dark:text-amber-400',
    };
    return (
        <div className="rounded-lg bg-gray-50 dark:bg-gray-700/40 px-3 py-2 text-center">
            <p className={`text-2xl font-bold tabular-nums ${tones[tone]}`}>{value}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        </div>
    );
}

export default function Capabilities() {
    const {
        profile, roles = [], permissionGroups = [], directPermissions = [],
        permissionCount = 0, orgAuthority = {}, projectRoles = {}, derived = [],
    } = usePage().props;

    const headsSomething = (orgAuthority.divisions?.length || 0)
        + (orgAuthority.departments?.length || 0)
        + (orgAuthority.teams?.length || 0) > 0;

    // How a granted permission reached the user, for the matrix rows.
    const sourceLabel = (p) => {
        const parts = [...(p.via || []).map(humanize)];
        if (p.direct) parts.push('Direct');
        return parts.join(', ');
    };

    return (
        <AuthenticatedLayout title={`${profile.name} — Roles & Capabilities`}>
            <PageHeader
                title="Roles & Capabilities"
                breadcrumbs={[
                    { label: 'Dashboard', href: '/dashboard' },
                    { label: 'Users', href: '/users' },
                    { label: profile.name, href: `/users/${profile.id}` },
                    { label: 'Roles & Capabilities' },
                ]}
                actions={
                    <Link href={`/users/${profile.id}`} className="px-4 py-2 text-sm font-medium bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-200 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600">
                        View Overview
                    </Link>
                }
            />

            {/* Identity */}
            <Card className="mb-6">
                <div className="flex flex-wrap items-center gap-4">
                    <Avatar name={profile.name} size="lg" />
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{profile.name}</h2>
                            {!profile.is_active && <Chip>Inactive</Chip>}
                            {profile.roles?.map((r) => <Chip key={r} tone="blue">{humanize(r)}</Chip>)}
                        </div>
                        <p className="text-sm text-gray-500 dark:text-gray-400">{profile.position || '—'} · {profile.email}</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                            {[profile.division, profile.department, profile.team].filter(Boolean).join(' › ') || 'No org unit'}
                        </p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Tile label={roles.length === 1 ? 'Role' : 'Roles'} value={roles.length} tone="blue" />
                        <Tile label="Capabilities" value={permissionCount} tone="green" />
                    </div>
                </div>
            </Card>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                {/* Roles */}
                <Card className="lg:col-span-2">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Roles</h3>
                    {roles.length === 0 ? (
                        <p className="text-sm text-gray-400 dark:text-gray-500">No roles assigned.</p>
                    ) : (
                        <div className="space-y-4">
                            {roles.map((role) => (
                                <div key={role.name} className="rounded-lg border border-gray-100 dark:border-gray-700 p-3">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">{humanize(role.name)}</span>
                                        <span className="text-xs text-gray-400">{role.permissions.length} {role.permissions.length === 1 ? 'capability' : 'capabilities'}</span>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {role.permissions.length === 0
                                            ? <span className="text-xs text-gray-400">No capabilities</span>
                                            : role.permissions.map((p) => <Chip key={p}>{humanize(p)}</Chip>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    {directPermissions.length > 0 && (
                        <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">Granted directly</p>
                            <div className="flex flex-wrap gap-1.5">
                                {directPermissions.map((p) => <Chip key={p} tone="amber">{humanize(p)}</Chip>)}
                            </div>
                        </div>
                    )}
                </Card>

                {/* Derived abilities */}
                <Card className="lg:col-span-1">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Other abilities</h3>
                    <ul className="space-y-3">
                        {derived.map((d) => (
                            <li key={d.label} className="flex items-start gap-2.5">
                                {d.has ? <CheckIcon /> : <DashIcon />}
                                <div className="min-w-0">
                                    <p className={`text-sm ${d.has ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>{d.label}</p>
                                    <p className="text-xs text-gray-400 dark:text-gray-500">{d.note}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                {/* Organizational authority */}
                <Card>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Organisational authority</h3>
                    {headsSomething ? (
                        <div className="space-y-3">
                            {[
                                { label: 'Heads divisions', items: orgAuthority.divisions },
                                { label: 'Heads departments', items: orgAuthority.departments },
                                { label: 'Leads teams', items: orgAuthority.teams },
                            ].filter((r) => r.items?.length).map((row) => (
                                <div key={row.label}>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">{row.label}</p>
                                    <div className="flex flex-wrap gap-1.5">
                                        {row.items.map((n) => <Chip key={n} tone="green">{n}</Chip>)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-400 dark:text-gray-500">Does not head any division, department or team.</p>
                    )}
                </Card>

                {/* Project access */}
                <Card>
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-4">Project access</h3>
                    <div className="grid grid-cols-4 gap-3">
                        <Tile label="Owner" value={projectRoles.owner || 0} tone="blue" />
                        <Tile label="Admin" value={projectRoles.admin || 0} tone="green" />
                        <Tile label="Editor" value={projectRoles.editor || 0} />
                        <Tile label="Viewer" value={projectRoles.viewer || 0} />
                    </div>
                    <p className="mt-3 text-xs text-gray-400 dark:text-gray-500">
                        Roles held on individual projects, separate from the permissions above.
                    </p>
                </Card>
            </div>

            {/* Full capability matrix */}
            <Card padding={false}>
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
                    <h3 className="text-base font-semibold text-gray-900 dark:text-white">All capabilities</h3>
                    <span className="text-xs text-gray-400">Granted capabilities are ticked; the rest show what this user cannot do.</span>
                </div>
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {permissionGroups.map((group) => (
                        <div key={group.resource} className="px-6 py-4">
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{group.label}</p>
                            <ul className="space-y-1.5">
                                {group.permissions.map((p) => (
                                    <li key={p.name} className="flex items-center gap-3">
                                        {p.has ? <CheckIcon /> : <DashIcon />}
                                        <span className={`text-sm flex-1 min-w-0 truncate ${p.has ? 'text-gray-800 dark:text-gray-200' : 'text-gray-400 dark:text-gray-500'}`}>
                                            {humanize(p.name)}
                                        </span>
                                        {p.has && (
                                            <span className="shrink-0 text-xs text-gray-400 dark:text-gray-500 truncate max-w-[45%]" title={sourceLabel(p)}>
                                                {sourceLabel(p) || 'Granted'}
                                            </span>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </div>
            </Card>
        </AuthenticatedLayout>
    );
}
