import { NextRequest, NextResponse } from 'next/server';
import { 
  registerArnsName, 
  checkNameAvailability, 
  estimateRegistrationCost,
  validateArnsName,
  updateArnsRecord 
} from '@/service/arns';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, name, target, years = 1 } = body;

    // Validate required fields
    if (!action) {
      return NextResponse.json(
        { error: 'Action is required' },
        { status: 400 }
      );
    }

    switch (action) {
      case 'check':
        return await handleCheck(name);
      
      case 'estimate':
        return await handleEstimate(name, years);
      
      case 'register':
        return await handleRegister(name, target, years);
      
      case 'update':
        return await handleUpdate(name, target);
      
      default:
        return NextResponse.json(
          { error: 'Invalid action. Supported actions: check, estimate, register, update' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('ArNS API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

async function handleCheck(name: string) {
  if (!name) {
    return NextResponse.json(
      { error: 'Name is required for check action' },
      { status: 400 }
    );
  }

  // Validate name format
  const validation = validateArnsName(name);
  if (!validation.valid) {
    return NextResponse.json({
      available: false,
      valid: false,
      error: validation.error
    });
  }

  // Check availability
  const availability = await checkNameAvailability(name);
  
  return NextResponse.json({
    available: availability.available,
    valid: true,
    info: availability.info,
    error: availability.error
  });
}

async function handleEstimate(name: string, years: number) {
  if (!name) {
    return NextResponse.json(
      { error: 'Name is required for estimate action' },
      { status: 400 }
    );
  }

  // Validate name format first
  const validation = validateArnsName(name);
  if (!validation.valid) {
    return NextResponse.json(
      { error: `Invalid name format: ${validation.error}` },
      { status: 400 }
    );
  }

  try {
    const cost = await estimateRegistrationCost(name, years);
    return NextResponse.json({
      name,
      years,
      costInIOTokens: cost.costInIOTokens,
      costInAR: cost.costInAR,
      formattedCost: cost.formattedCost
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Failed to estimate cost: ${error.message}` },
      { status: 500 }
    );
  }
}

async function handleRegister(name: string, target: string, years: number) {
  if (!name || !target) {
    return NextResponse.json(
      { error: 'Name and target are required for register action' },
      { status: 400 }
    );
  }

  // Validate name format
  const validation = validateArnsName(name);
  if (!validation.valid) {
    return NextResponse.json(
      { error: `Invalid name format: ${validation.error}` },
      { status: 400 }
    );
  }

  // Validate target (should be a valid Arweave transaction ID)
  if (!/^[a-zA-Z0-9_-]{43}$/.test(target)) {
    return NextResponse.json(
      { error: 'Target must be a valid Arweave transaction ID (43 characters)' },
      { status: 400 }
    );
  }

  try {
    const result = await registerArnsName({
      name,
      target,
      years
    });

    return NextResponse.json({
      success: true,
      name: result.name,
      transactionId: result.transactionId,
      target: result.target,
      cost: result.cost,
      registrationUrl: result.registrationUrl,
      message: `Successfully registered ${name}.ar-io.dev pointing to ${target}`
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Registration failed: ${error.message}` },
      { status: 500 }
    );
  }
}

async function handleUpdate(name: string, target: string) {
  if (!name || !target) {
    return NextResponse.json(
      { error: 'Name and target are required for update action' },
      { status: 400 }
    );
  }

  // Validate target (should be a valid Arweave transaction ID)
  if (!/^[a-zA-Z0-9_-]{43}$/.test(target)) {
    return NextResponse.json(
      { error: 'Target must be a valid Arweave transaction ID (43 characters)' },
      { status: 400 }
    );
  }

  try {
    const result = await updateArnsRecord(name, target);

    return NextResponse.json({
      success: true,
      name: result.name,
      transactionId: result.transactionId,
      newTarget: result.newTarget,
      updateUrl: result.updateUrl,
      message: `Successfully updated ${name}.ar-io.dev to point to ${target}`
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: `Update failed: ${error.message}` },
      { status: 500 }
    );
  }
}

// GET endpoint for checking name availability (convenience method)
export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const name = searchParams.get('name');

  if (!name) {
    return NextResponse.json(
      { error: 'Name parameter is required' },
      { status: 400 }
    );
  }

  try {
    return await handleCheck(name);
  } catch (error: any) {
    console.error('ArNS GET Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
} 