import { NextResponse } from 'next/server';
import { serializePrismaDecimals } from './decimal';

export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data: serializePrismaDecimals(data) }, { status });
}

export function errorResponse(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}
