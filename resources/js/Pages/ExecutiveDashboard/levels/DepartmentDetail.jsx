import MetricCards from '../components/MetricCards';
import OrgUnitCard from '../components/OrgUnitCard';
import ActivityTrendChart from '../components/ActivityTrendChart';
import WorkloadChart from '../components/WorkloadChart';
import AtRiskItems from '../components/AtRiskItems';

export default function DepartmentDetail({ metrics, units, activityTrend, workload, atRiskItems }) {
    return (
        <div className="space-y-6">
            <MetricCards data={metrics} />

            {units?.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Teams</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {units.map((team) => (
                            <OrgUnitCard
                                key={team.id}
                                unit={team}
                                href={`/executive-dashboard/teams/${team.id}`}
                                stats={[
                                    { label: 'Members', value: team.members_count },
                                    { label: 'Tasks', value: team.total_tasks },
                                    { label: 'Done', value: team.completed_tasks },
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
