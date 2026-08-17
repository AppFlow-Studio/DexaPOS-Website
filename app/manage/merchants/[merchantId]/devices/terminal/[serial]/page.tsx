import { PaymentDeviceDetailView } from './PaymentDeviceDetailView'

export default async function PaymentDeviceDetailPage({
    params,
}: {
    params: Promise<{ merchantId: string; serial: string }>
}) {
    const { merchantId, serial } = await params
    return <PaymentDeviceDetailView merchantId={merchantId} serial={decodeURIComponent(serial)} />
}
