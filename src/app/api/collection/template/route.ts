import { NextResponse } from 'next/server';
import { csvTemplate } from '@/server/services/csv';

/** A one-row example so an importer can see the expected shape before trying. */
export function GET(): NextResponse {
  return new NextResponse(`﻿${csvTemplate()}`, {
    headers: {
      'content-type': 'text/csv; charset=utf-8',
      'content-disposition': 'attachment; filename="trackmydex-template.csv"',
      'cache-control': 'public, max-age=3600',
    },
  });
}
