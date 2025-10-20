import { useQuery } from "@tanstack/react-query";
import { GetMerchants } from "../actions/get-merchants";
export function useMerchantOrganizations() {
    return useQuery({
        queryKey: ['merchantOrganizations'],
        queryFn: GetMerchants,
    })
}