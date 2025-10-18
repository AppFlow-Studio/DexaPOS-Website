'use server'
import { createServerSupabaseClient } from "@/lib/supabase/server"

export const GetMerchants = async () => {
    try {
        const supabase = createServerSupabaseClient()
        const { data: Merchants, error } = await supabase.from('merchants').select('*')
        if (error) {
            return {
                success: false,
                message: 'Failed to fetch merchant organizaions' + error?.message
            }
        }
        return Merchants
    }
    catch (error) {
        console.error(error)
        return {
            success: false,
            message: 'Failed to fetch merchant organizaions' + error?.message
        }
    }
}