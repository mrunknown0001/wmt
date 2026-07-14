import MetricCards from '../components/MetricCards';
import OrgUnitCard from '../components/OrgUnitCard';
import ActivityTrendChart from '../components/ActivityTrendChart';
import TopContributorsChart from '../components/TopContributorsChart';
import TopPerformers from '../../../Components/Dashboard/TopPerformers';
import AtRiskItems from '../components/AtRiskItems';

export default function OrgOverview({ metrics, divisions, activityTrend, topContributors, topTeams, topDepartments, atRiskItems }) {
    return (
        <div className="space-y-6">
            <MetricCards data={metrics} />

            {divisions?.length > 0 && (
                <div>
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">Divisions</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {divisions.map((div) => (
                            <OrgUnitCard
                                key={div.id}
                                unit={div}
                                href={`/executive-dashboard/divisions/${div.id}`}
                                stats={[
                                    { label: 'Depts', value: div.departments_count },
                                    { label: 'Teams', value: div.teams_count },
                                    { label: 'Members', value: div.members_count },
                                    { label: 'Projects', value: div.active_projects },
                                ]}
                            />
                        ))}
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <ActivityTrendChart data={activityTrend} />
                <TopContributorsChart data={topContributors} />
            </div>

            {(topTeams?.length > 0 || topDepartments?.length > 0) && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <TopPerformers title="Top 5 Teams" units={topTeams} contextKey="department" />
                    <TopPerformers title="Top 5 Departments" units={topDepartments} contextKey="division" />
                </div>
            )}

            <AtRiskItems items={atRiskItems} />
        </div>
    );
}
