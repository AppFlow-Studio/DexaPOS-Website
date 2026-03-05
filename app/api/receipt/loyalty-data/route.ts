import { GetReceiptLoyaltyData } from '@/app/dashboard/actions/loyalty-receipt';
import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/receipt/loyalty-data
 *
 * Fetch loyalty program data for a customer to display on their receipt.
 *
 * Request body:
 * {
 *   customerId: string (UUID)
 *   merchantId: string (UUID)
 * }
 *
 * Response:
 * {
 *   programs: [
 *     {
 *       program_id: string,
 *       program_name: string,
 *       program_type: string,
 *       emoji: string,
 *       points_earned: number,
 *       current_balance: number,
 *       progress_toward_reward: { amount, threshold, points_remaining },
 *       rewards_available: number,
 *       message: string
 *     }
 *   ],
 *   has_available_rewards: boolean,
 *   available_rewards_count: number,
 *   call_to_action?: string
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { customerId, merchantId } = body;

    // Validate inputs
    if (!customerId) {
      return NextResponse.json(
        { error: 'Missing customerId in request body' },
        { status: 400 }
      );
    }

    if (!merchantId) {
      return NextResponse.json(
        { error: 'Missing merchantId in request body' },
        { status: 400 }
      );
    }

    // Fetch loyalty data
    const loyaltyData = await GetReceiptLoyaltyData(customerId, merchantId);

    // Return with CORS headers for POS app
    return NextResponse.json(loyaltyData, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  } catch (error) {
    console.error('[Receipt Loyalty API] Error:', error);

    return NextResponse.json(
      {
        error: 'Failed to fetch loyalty data',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * OPTIONS handler for CORS preflight
 */
export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
