'use client'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Settings, AlertTriangle, Trash2 } from 'lucide-react'
import { DeleteOrganizationDialog } from '../../../organizations/[organizationId]/componenets/DeleteOrganizationDialog'
import { useState } from 'react'
import { MerchantInfoModel } from '@/types/db-modles'

interface SettingsTabProps {
    merchantInfo: MerchantInfoModel
    refetchMerchantInfo: () => void
}

export function SettingsTab({ merchantInfo, refetchMerchantInfo }: SettingsTabProps) {
    const [openDeleteOrganizationDialog, setOpenDeleteOrganizationDialog] = useState(false)

    return (
        <>
            <div className="space-y-6">
                {/* General Settings */}
                <Card>
                    <CardHeader>
                        <CardTitle>General Settings</CardTitle>
                        <CardDescription>Configure merchant account and preferences</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="text-center py-12">
                            <Settings className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                            <h3 className="text-lg font-semibold mb-2">General Settings</h3>
                            <p className="text-sm text-muted-foreground">
                                Merchant configuration and settings panel coming soon.
                            </p>
                        </div>
                    </CardContent>
                </Card>

                {/* Danger Zone */}
                <Card className="border-destructive">
                    <CardHeader>
                        <CardTitle className="text-destructive flex items-center gap-2">
                            <AlertTriangle className="h-5 w-5" />
                            Danger Zone
                        </CardTitle>
                        <CardDescription>
                            Irreversible and destructive actions. Please proceed with caution.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 border border-destructive/20 rounded-lg bg-destructive/5">
                                <div className="space-y-1">
                                    <h4 className="font-medium text-destructive">Delete Organization</h4>
                                    <p className="text-sm text-muted-foreground">
                                        Permanently delete this merchant organization and all associated data.
                                        This action cannot be undone.
                                    </p>
                                </div>
                                <Button
                                    variant="destructive"
                                    onClick={() => setOpenDeleteOrganizationDialog(true)}
                                    className="ml-4"
                                >
                                    <Trash2 className="h-4 w-4 mr-2" />
                                    Delete Organization
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            </div>
            <DeleteOrganizationDialog
                organizationId={merchantInfo?.clerk_org_id as string}
                organizationName={merchantInfo?.name || 'Merchant'}
                open={openDeleteOrganizationDialog}
                setOpen={setOpenDeleteOrganizationDialog}
                onSuccess={() => refetchMerchantInfo()}
            />
        </>
    )
}
