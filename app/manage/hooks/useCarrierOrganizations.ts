import { useQuery } from "@tanstack/react-query"
import { GetCarrierOrganizations } from "../actions/get-organizations"

export function useCarrierOrganizations() {
    return useQuery({
        queryKey: ['carrierOrganizations'],
        queryFn: GetCarrierOrganizations,
    })
}