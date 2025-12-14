'use client'
import { useOrganizationInfo } from '@/app/manage/hooks/useOrganizationInfo'
import { useUser } from '@clerk/nextjs'

export default function OfficePage() {
    const { user } = useUser()
    // const { data, isLoading, error } = useOrganizationInfo(user?.publicMetadata.org_id)
    // if (isLoading) return <div>Loading...</div>
    // if (error) return <div>Error: {error.message}</div>
    // if (!data) return <div>No organization found</div>
    
    return <div>
        {/* <h1>{data.name}</h1>
        <p>{data.description}</p>
        <p>{data.imageURL}</p>
        <p>{data.created_at}</p>
        <p>{data.updated_at}</p> */}
    </div>
}