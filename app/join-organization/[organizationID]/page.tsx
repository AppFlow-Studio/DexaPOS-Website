'use client'
// app/join-organization/page.tsx (or .jsx)
import { useEffect } from 'react';
import { useAuth, useOrganizationList } from '@clerk/nextjs';
import { useRouter, useSearchParams } from 'next/navigation';

export default function JoinOrganizationPage() {
  const { userId, isLoaded: authLoaded } = useAuth();
  const { userMemberships: organizationList, isLoaded: orgLoaded, setActive } = useOrganizationList();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orgId = searchParams.get('orgId');

  useEffect(() => {
    if (!authLoaded || !orgLoaded || !userId) return;

    const handleOrgSetup = async () => {
      // Check if user is already in the organization
      const existingMembership = organizationList?.data?.find(
        (item: any) => item.organization.id === orgId
      );

      if (existingMembership) {
        // User is already a member, set as active and redirect
        await setActive({ organization: existingMembership.organization.id });
        router.push('/dashboard'); // or wherever your org dashboard is
      } else {
        // User needs to be added - this should have happened in the webhook
        // but we can show a loading state or error
        console.log('Waiting for organization membership to be created...');
        
        // Poll for membership creation (webhook might still be processing)
        setTimeout(() => {
          window.location.reload();
        }, 2000);
      }
    };

    handleOrgSetup();
  }, [authLoaded, orgLoaded, userId, orgId, organizationList]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center">
        <h2>Setting up your organization...</h2>
        <p>Please wait while we configure your access.</p>
      </div>
    </div>
  );
}