'use client'
import { useOrganizationList, OrganizationSwitcher } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

// Fallback to hardcoded value if env var not set
const DEXA_HQ_ORG_ID = process.env.NEXT_PUBLIC_DEXA_POS_INTERNAL_TEAM_ID || 'org_33z36QibAMZy6kc2xZNYmDl5duh';

export default function OrganizationSelector() {
  const router = useRouter();
  const [isSettingOrg, setIsSettingOrg] = useState(false);
  const { setActive, userMemberships, isLoaded } = useOrganizationList({ 
    userMemberships: true 
  });

  useEffect(() => {
    if (!isLoaded || isSettingOrg) return;
    
    const memberships = userMemberships?.data;
    if (memberships && memberships.length > 0) {
      setIsSettingOrg(true);
      setActive?.({ organization: memberships[0].organization.id })
        .then(() => {
          // Redirect based on org type
          const orgId = memberships[0].organization.id;
          if (orgId === DEXA_HQ_ORG_ID) {
            router.push('/manage');
          } else {
            router.push('/dashboard');
          }
        })
        .catch((err) => {
          console.error('Failed to set active org:', err);
          setIsSettingOrg(false);
        });
    }
  }, [isLoaded, userMemberships?.data, setActive, isSettingOrg, router]);

  // Show loading while checking memberships or setting org
  if (!isLoaded || isSettingOrg) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <h2 className="text-lg font-medium">Setting up your organization...</h2>
          <p className="text-sm text-muted-foreground mt-2">Please wait while we configure your access.</p>
        </div>
      </div>
    );
  }

  // No memberships - show org switcher for manual selection
  return (
    <main className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-4">
        <h2 className="text-lg font-medium">Select an Organization</h2>
        <p className="text-sm text-muted-foreground">Choose which organization you want to access.</p>
        <OrganizationSwitcher />
      </div>
    </main>
  );
}
