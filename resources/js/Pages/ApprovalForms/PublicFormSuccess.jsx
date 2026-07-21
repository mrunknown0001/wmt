import { Head } from '@inertiajs/react';

export default function PublicFormSuccess({ form, message }) {
    return (
        <>
            <Head title="Form Submitted" />
            <div className="min-h-screen bg-gradient-to-br from-green-50 to-green-100 dark:from-gray-900 dark:to-gray-800 flex items-center justify-center py-12 px-4">
                <div className="text-center max-w-2xl mx-auto">
                    {/* Success Icon */}
                    <div className="mb-6 flex justify-center">
                        <div className="w-20 h-20 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                            <svg
                                className="w-10 h-10 text-green-600 dark:text-green-400"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                            >
                                <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                                />
                            </svg>
                        </div>
                    </div>

                    {/* Message */}
                    <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
                        Thank You!
                    </h1>
                    <p className="text-lg text-gray-600 dark:text-gray-400 mb-6">
                        {message || 'Your submission has been received and is now in review.'}
                    </p>

                    {/* Additional Info */}
                    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 text-left">
                        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
                            What happens next?
                        </h2>
                        <ul className="space-y-3 text-gray-600 dark:text-gray-400">
                            <li className="flex items-center">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Your request has been submitted for approval
                            </li>
                            <li className="flex items-center">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                Approver will review your submission
                            </li>
                            <li className="flex items-center">
                                <svg className="w-5 h-5 text-green-600 dark:text-green-400 mr-3" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                                </svg>
                                You will be notified when a decision is made
                            </li>
                        </ul>
                    </div>

                    {/* Footer */}
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-8">
                        If you have any questions, please contact our support team.
                    </p>
                </div>
            </div>
        </>
    );
}
