'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Calendar, Plus, Clock, User } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'

export default function EmployeeSchedulesPage() {
    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight">Employee Schedules</h2>
                    <p className="text-muted-foreground">
                        Manage work schedules and shifts for your staff members.
                    </p>
                </div>
                <Button>
                    <Plus className="h-4 w-4 mr-2" />
                    Create Schedule
                </Button>
            </div>

            {/* Schedule Overview */}
            <div className="grid gap-4 md:grid-cols-3">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">This Week</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground">
                            Scheduled shifts
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active Staff</CardTitle>
                        <User className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0</div>
                        <p className="text-xs text-muted-foreground">
                            Employees scheduled
                        </p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Total Hours</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">0h</div>
                        <p className="text-xs text-muted-foreground">
                            Scheduled this week
                        </p>
                    </CardContent>
                </Card>
            </div>

            {/* Schedule Views */}
            <Card>
                <CardHeader>
                    <CardTitle>Schedule</CardTitle>
                    <CardDescription>View and manage employee schedules by week or month</CardDescription>
                </CardHeader>
                <CardContent>
                    <Tabs defaultValue="week" className="w-full">
                        <TabsList>
                            <TabsTrigger value="week">Week View</TabsTrigger>
                            <TabsTrigger value="month">Month View</TabsTrigger>
                            <TabsTrigger value="list">List View</TabsTrigger>
                        </TabsList>

                        <TabsContent value="week" className="mt-4">
                            <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
                                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Weekly Schedule</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Weekly schedule view coming soon
                                </p>
                                <Button variant="outline">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Shift
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="month" className="mt-4">
                            <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
                                <Calendar className="h-12 w-12 text-muted-foreground mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Monthly Schedule</h3>
                                <p className="text-sm text-muted-foreground mb-4">
                                    Monthly schedule view coming soon
                                </p>
                                <Button variant="outline">
                                    <Plus className="h-4 w-4 mr-2" />
                                    Add Shift
                                </Button>
                            </div>
                        </TabsContent>

                        <TabsContent value="list" className="mt-4">
                            <div className="space-y-4">
                                <div className="flex flex-col items-center justify-center py-12 border rounded-lg">
                                    <Clock className="h-12 w-12 text-muted-foreground mb-4" />
                                    <h3 className="text-lg font-semibold mb-2">No Schedules</h3>
                                    <p className="text-sm text-muted-foreground mb-4">
                                        Create your first employee schedule to get started
                                    </p>
                                    <Button>
                                        <Plus className="h-4 w-4 mr-2" />
                                        Create Schedule
                                    </Button>
                                </div>
                            </div>
                        </TabsContent>
                    </Tabs>
                </CardContent>
            </Card>

            {/* Upcoming Shifts */}
            <Card>
                <CardHeader>
                    <CardTitle>Upcoming Shifts</CardTitle>
                    <CardDescription>Shifts scheduled for the next 7 days</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex flex-col items-center justify-center py-8">
                        <Clock className="h-10 w-10 text-muted-foreground mb-3" />
                        <p className="text-sm text-muted-foreground">
                            No upcoming shifts scheduled
                        </p>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
