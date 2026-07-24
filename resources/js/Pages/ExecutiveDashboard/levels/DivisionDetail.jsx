import MetricCards from '../components/MetricCards';
import OrgUnitCard from '../components/OrgUnitCard';
import ActivityTrendChart from '../components/ActivityTrendChart';
import WorkloadChart from '../components/WorkloadChart';
import AtRiskItems from '../components/AtRiskItems';

export default function DivisionDetail({ metrics, units, activityTrend, workload, atRiskItems, entity }) {
    return (
        <div className="space-y-6">
            <MetricCards data={metrics} scope="division" scopeId={entity?.id} />

            {units?.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Departments</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {units.map((dept) => (
                            <OrgUnitCard
                                key={dept.id}
                                unit={dept}
                                href={`/executive-dashboard/departments/${dept.id}`}
                                stats={[
                                    { label: 'Teams', value: dept.teams_count },
                                    { label: 'Members', value: dept.members_count },
                                    { label: 'Tasks', value: dept.total_tasks },
                                ]}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ActivityTrendChart data={activityTrend} />
                <WorkloadChart data={workload} />
            </div>

            <AtRiskItems items={atRiskItems} />
        </div>
    );
}
