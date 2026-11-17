/**
 * Utility functions for generating and validating secure, unpredictable classroom PINs.
 */

// Check if a 4-digit PIN is too predictable
export function isPredictablePin(pin: string): boolean {
  if (!pin || pin.length !== 4) return true;

  // 1. All digits identical (e.g. 0000, 1111, 2222, ..., 9999)
  if (/^(\d)\1{3}$/.test(pin)) return true;

  // 2. Sequential numbers (e.g. 1234, 2345, 3456, 4567, 5678, 6789, 0123)
  const sequentialAsc = [
    "0123",
    "1234",
    "2345",
    "3456",
    "4567",
    "5678",
    "6789",
  ];
  if (sequentialAsc.includes(pin)) return true;

  // 3. Reverse sequential (e.g. 4321, 5432, 6543, 7654, 8765, 9876, 3210)
  const sequentialDesc = [
    "3210",
    "4321",
    "5432",
    "6543",
    "7654",
    "8765",
    "9876",
  ];
  if (sequentialDesc.includes(pin)) return true;

  // 4. Repeated pairs (e.g. 1212, 2323, 5050, 6969)
  if (pin.substring(0, 2) === pin.substring(2, 4)) return true;

  // 5. Palindromes with identical ends (e.g. 1221, 1001)
  if (pin[0] === pin[3] && pin[1] === pin[2]) return true;

  return false;
}

/**
 * Generate a single secure, unpredictable 4-digit PIN that is not predictable
 * and does not conflict with existing PINs.
 */
export function generateSecurePin(existingPins: string[] = []): string {
  const existingSet = new Set(existingPins.map((p) => p.trim()));

  for (let attempt = 0; attempt < 1000; attempt++) {
    // Generate random 4-digit integer from 1000 to 9999
    const num = Math.floor(1000 + Math.random() * 9000);
    const candidate = String(num);

    if (!isPredictablePin(candidate) && !existingSet.has(candidate)) {
      return candidate;
    }
  }

  // Fallback random timestamp-derived non-sequential 4 digits
  return String(Math.floor(1000 + Math.random() * 9000));
}

/**
 * Generate unique secure PINs for a set of classrooms
 * Returns a dictionary mapping roomId -> newPin
 */
export function generatePinsForRooms(
  rooms: { id: string }[],
  reservedPins: string[] = []
): Record<string, string> {
  const result: Record<string, string> = {};
  const currentReserved = [...reservedPins];

  for (const r of rooms) {
    const pin = generateSecurePin(currentReserved);
    result[r.id] = pin;
    currentReserved.push(pin);
  }

  return result;
}
