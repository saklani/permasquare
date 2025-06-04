// import { NextRequest, NextResponse } from 'next/server';
// import { ARIO, ANT } from '@ar.io/sdk/node';
// import { ArNSUtils } from '@/lib/arns/utils';

// // Initialize IO client for read-only operations
// const io = ARIO.init();

// export async function POST(request: NextRequest) {
//   try {
//     const { action, ...params } = await request.json();

//     switch (action) {
//       case 'check_availability':
//         return await handleCheckAvailability(params);
//       case 'get_costs':
//         return await handleGetCosts(params);
//       case 'get_suggestions':
//         return await handleGetSuggestions(params);
//       case 'validate_name':
//         return await handleValidateName(params);
//       case 'get_record':
//         return await handleGetRecord(params);
//       case 'get_user_domains':
//         return await handleGetUserDomains(params);
//       default:
//         return NextResponse.json(
//           { error: 'Invalid action' },
//           { status: 400 }
//         );
//     }
//   } catch (error) {
//     console.error('ArNS API error:', error);
//     return NextResponse.json(
//       { error: 'Internal server error' },
//       { status: 500 }
//     );
//   }
// }

// async function handleCheckAvailability({ name }: { name: string }) {
//   try {
//     if (!name || typeof name !== 'string') {
//       return NextResponse.json(
//         { error: 'Name is required' },
//         { status: 400 }
//       );
//     }

//     // Validate name format
//     if (!ArNSUtils.isValidArNSName(name)) {
//       return NextResponse.json({
//         name,
//         available: false,
//         valid: false,
//         reason: 'Invalid name format. Names must be 1-51 characters, alphanumeric and hyphens only, starting and ending with alphanumeric characters.'
//       });
//     }

//     // Check if name exists
//     let existingRecord = null;
//     let available = true;

//     try {
//       const record = await io.getArNSRecord({ name });
//       if (record) {
//         existingRecord = {
//           name,
//           processId: record.processId,
//           type: record.type,
//           startTimestamp: record.startTimestamp,
//           undernameLimit: record.undernameLimit
//         };

//         // Check if lease has expired
//         if (record.type === 'lease' && record.endTimestamp && record.endTimestamp < Date.now()) {
//           available = true; // Expired lease, available for re-registration
//         } else {
//           available = false; // Name is taken
//         }
//       }
//     } catch (error) {
//       // Name not found, it's available
//       available = true;
//     }

//     // Get cost estimates if available
//     let costs = null;
//     if (available) {
//       try {
//         costs = await getCostEstimates(name);
//       } catch (error) {
//         console.warn('Could not get cost estimates:', error);
//         // Fallback to estimated costs
//         costs = getEstimatedCosts(name);
//       }
//     }

//     return NextResponse.json({
//       name,
//       available,
//       valid: true,
//       costs,
//       existingRecord,
//       suggestions: available ? [] : ArNSUtils.generateNameSuggestions(name)
//     });

//   } catch (error) {
//     console.error('Error checking availability:', error);
//     return NextResponse.json(
//       { error: 'Failed to check name availability' },
//       { status: 500 }
//     );
//   }
// }

// async function handleGetCosts({ name }: { name: string }) {
//   try {
//     if (!name || !ArNSUtils.isValidArNSName(name)) {
//       return NextResponse.json(
//         { error: 'Invalid name' },
//         { status: 400 }
//       );
//     }

//     const costs = await getCostEstimates(name);
//     return NextResponse.json({ name, costs });

//   } catch (error) {
//     console.error('Error getting costs:', error);
//     // Return estimated costs as fallback
//     const estimatedCosts = getEstimatedCosts(name);
//     return NextResponse.json({ name, costs: estimatedCosts });
//   }
// }

// async function handleGetSuggestions({ baseName }: { baseName: string }) {
//   try {
//     if (!baseName || typeof baseName !== 'string') {
//       return NextResponse.json(
//         { error: 'Base name is required' },
//         { status: 400 }
//       );
//     }

//     const suggestions = ArNSUtils.generateNameSuggestions(baseName);
    
//     // Check availability for suggestions
//     const suggestionsWithAvailability = await Promise.all(
//       suggestions.map(async (suggestion) => {
//         try {
//           const record = await io.getArNSRecord({ name: suggestion });
//           return {
//             name: suggestion,
//             available: false,
//             reason: 'Already registered'
//           };
//         } catch (error) {
//           return {
//             name: suggestion,
//             available: true,
//             reason: null
//           };
//         }
//       })
//     );

//     return NextResponse.json({
//       baseName,
//       suggestions: suggestionsWithAvailability.filter(s => s.available).slice(0, 5)
//     });

//   } catch (error) {
//     console.error('Error getting suggestions:', error);
//     return NextResponse.json(
//       { error: 'Failed to get suggestions' },
//       { status: 500 }
//     );
//   }
// }

// async function handleValidateName({ name }: { name: string }) {
//   try {
//     const valid = ArNSUtils.isValidArNSName(name);
//     let reason = null;

//     if (!valid) {
//       if (!name) {
//         reason = 'Name is required';
//       } else if (name.length < 1) {
//         reason = 'Name must be at least 1 character';
//       } else if (name.length > 51) {
//         reason = 'Name must be 51 characters or less';
//       } else if (!/^[a-zA-Z0-9]/.test(name)) {
//         reason = 'Name must start with a letter or number';
//       } else if (!/[a-zA-Z0-9]$/.test(name)) {
//         reason = 'Name must end with a letter or number';
//       } else if (!/^[a-zA-Z0-9-]+$/.test(name)) {
//         reason = 'Name can only contain letters, numbers, and hyphens';
//       } else {
//         reason = 'Invalid name format';
//       }
//     }

//     return NextResponse.json({
//       name,
//       valid,
//       reason
//     });

//   } catch (error) {
//     console.error('Error validating name:', error);
//     return NextResponse.json(
//       { error: 'Failed to validate name' },
//       { status: 500 }
//     );
//   }
// }

// async function handleGetRecord({ name }: { name: string }) {
//   try {
//     if (!name || !ArNSUtils.isValidArNSName(name)) {
//       return NextResponse.json(
//         { error: 'Invalid name' },
//         { status: 400 }
//       );
//     }

//     const record = await io.getArNSRecord({ name });
    
//     // Get ANT info
//     let antInfo = null;
//     try {
//       const ant = ANT.init({ processId: record.processId });
//       const [state, owner, controllers] = await Promise.all([
//         ant.getState(),
//         ant.getOwner(),
//         ant.getControllers()
//       ]);

//       antInfo = {
//         owner,
//         controllers,
//         records: state.Records || {},
//         name: state.Name || '',
//         ticker: state.Ticker || ''
//       };
//     } catch (error) {
//       console.warn('Could not get ANT info:', error);
//     }

//     return NextResponse.json({
//       record: {
//         name,
//         ...record
//       },
//       ant: antInfo,
//       status: ArNSUtils.formatDomainStatus(record),
//       url: ArNSUtils.formatArNSUrl(name)
//     });

//   } catch (error) {
//     console.error('Error getting record:', error);
//     return NextResponse.json(
//       { error: 'Record not found' },
//       { status: 404 }
//     );
//   }
// }

// async function handleGetUserDomains({ address }: { address: string }) {
//   try {
//     if (!address) {
//       return NextResponse.json(
//         { error: 'Wallet address is required' },
//         { status: 400 }
//       );
//     }

//     // Get all ArNS records
//     const { items } = await io.getArNSRecords({
//       limit: 1000,
//       sortBy: 'startTimestamp',
//       sortOrder: 'desc'
//     });

//     // Filter records owned by the user
//     const userRecords = [];
    
//     for (const item of items) {
//       try {
//         // Get ANT info to check ownership
//         const ant = ANT.init({ processId: item.processId });
//         const owner = await ant.getOwner();
        
//         if (owner === address) {
//           userRecords.push({
//             ...item,
//             status: ArNSUtils.formatDomainStatus(item),
//             url: ArNSUtils.formatArNSUrl(item.name)
//           });
//         }
//       } catch (error) {
//         // Skip if can't verify ownership
//         console.warn(`Could not verify ownership for ${item.name}:`, error);
//       }
//     }

//     return NextResponse.json({
//       address,
//       domains: userRecords,
//       count: userRecords.length
//     });

//   } catch (error) {
//     console.error('Error getting user domains:', error);
//     return NextResponse.json(
//       { error: 'Failed to get user domains' },
//       { status: 500 }
//     );
//   }
// }

// // Get cost estimates from IO network
// async function getCostEstimates(name: string) {
//   const leaseCosts = {
//     1: 0,
//     2: 0,
//     3: 0,
//     4: 0,
//     5: 0
//   };

//   // Calculate lease costs for 1-5 years
//   for (let years = 1; years <= 5; years++) {
//     try {
//       const cost = await io.getTokenCost({
//         intent: 'Buy-Record',
//         name,
//         type: 'lease',
//         years
//       });
//       leaseCosts[years as keyof typeof leaseCosts] = cost;
//     } catch (error) {
//       console.warn(`Failed to get lease cost for ${years} year(s):`, error);
//     }
//   }

//   // Calculate permabuy cost
//   let permabuyCost = 0;
//   try {
//     permabuyCost = await io.getTokenCost({
//       intent: 'Buy-Record',
//       name,
//       type: 'permabuy'
//     });
//   } catch (error) {
//     console.warn('Failed to get permabuy cost:', error);
//   }

//   return {
//     lease: leaseCosts,
//     permabuy: permabuyCost
//   };
// }

// // Fallback cost estimation
// function getEstimatedCosts(name: string) {
//   const baseLease = ArNSUtils.calculateBaseCost(name, 'lease', 1);
//   const basePermabuy = ArNSUtils.calculateBaseCost(name, 'permabuy');

//   return {
//     lease: {
//       1: ArNSUtils.IOToMIO(baseLease.totalCost),
//       2: ArNSUtils.IOToMIO(baseLease.totalCost * 2),
//       3: ArNSUtils.IOToMIO(baseLease.totalCost * 3),
//       4: ArNSUtils.IOToMIO(baseLease.totalCost * 4),
//       5: ArNSUtils.IOToMIO(baseLease.totalCost * 5)
//     },
//     permabuy: ArNSUtils.IOToMIO(basePermabuy.totalCost)
//   };
// } 

export async function GET() {}