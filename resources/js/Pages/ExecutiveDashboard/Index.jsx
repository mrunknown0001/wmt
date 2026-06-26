import { usePage } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import PageHeader from '../../Components/PageHeader';
import DateFilter from './components/DateFilter';
import OrgOverview from './levels/OrgOverview';
import DivisionDetail from './levels/DivisionDetail';
import DepartmentDetail from './levels/DepartmentDetail';
import TeamDetail from './levels/TeamDetail';

const levelComponents = {
    overview: OrgOverview,
    division: DivisionDetail,
    department: DepartmentDetail,
    team: TeamDetail,
};

export default function Index() {
    const props = usePage().props;
    const { level, breadcrumbs, entity, filters } = props;

    const LevelComponent = levelComponents[level] || OrgOverview;

    const defaultBreadcrumbs = breadcrumbs || [
        { label: 'Dashboard', href: '/dashboard' },
        { label: 'Executive Dashboard' },
    ];

    const title = entity?.name
        ? `${entity.name} — Executive Dashboard`
        : 'Executive Dashboard';

    return (
        <AuthenticatedLayout title={title}>
            <PageHeader
                title={entity?.name || 'Executive Dashboard'}
                breadcrumbs={defaultBreadcrumbs}
            />
            <div className="mb-6">
                <DateFilter filters={filters} />
            </div>
            <LevelComponent {...props} />
        </AuthenticatedLayout>
    );
}
