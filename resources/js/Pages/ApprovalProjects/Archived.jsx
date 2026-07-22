import { Head, Link, router } from '@inertiajs/react';
import AuthenticatedLayout from '../../Layouts/AuthenticatedLayout';
import Button from '../../Components/Button';
import Pagination from '../../Components/Pagination';

export default function Archived({ projects }) {
    const handleUnarchive = (project) => {
        router.patch(route('approval-projects.archive', project.id), {}, { preserveScroll: true });
    };

    return (
        <AuthenticatedLayout title="Archived Approval Projects">
            <Head title="Archived Approval Projects" />
            <div className="space-y-6">
                <div className="flex items-center gap-4">
                    <Link href={route('approval-projects.index')} className="text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white">
                        <span className="inline-flex items-center gap-1"><svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" /></svg>Back</span>
                    </Link>
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Archived Approval Projects</h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-1">Projects hidden from the active list</p>
                    </div>
                </div>

                {projects.data.length === 0 ? (
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
                        <p className="text-gray-600 dark:text-gray-400">No archived approval projects</p>
                    </div>
                ) : (
                    <>
                        <div className="grid gap-4">
                            {projects.data.map((project) => (
                                <div key={project.id} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="flex-1">
                                            <Link href={route('approval-projects.show', project.id)}>
                                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white hover:text-primary-600 dark:hover:text-primary-400">
                                                    {project.name}
                                                </h3>
                                            </Link>
                                            {project.description && (
                                                <p className="text-gray-600 dark:text-gray-400 text-sm mt-1">{project.description}</p>
                                            )}
                                            <div className="flex items-center gap-4 mt-3 text-sm">
                                                <span className="px-2 py-1 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-100">
                                                    Archived
                                                </span>
                                                {project.owner && (
                                                    <span className="text-gray-600 dark:text-gray-400">Owner: {project.owner.name}</span>
                                                )}
                                            </div>
                                        </div>
                                        <Button variant="secondary" onClick={() => handleUnarchive(project)}>
                                            Unarchive
                                        </Button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
                            <Pagination links={projects.links} />
                        </div>
                    </>
                )}
            </div>
        </AuthenticatedLayout>
    );
}
