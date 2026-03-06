import { redirect } from 'next/navigation'

export default function LegacyCreateMerchantPage() {
  redirect('/manage/merchants/new')
}
