import { useQuery } from "@tanstack/react-query";
import { GetMerchants } from "../actions/get-merchants";
export function useMerhcantOrganizations() {
    return useQuery({
        queryKey: ['merchantOrganizations'],
        queryFn: GetMerchants,
    })
}