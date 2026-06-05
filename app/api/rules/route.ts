import { NextResponse } from 'next/server'

export async function GET() {
  try {
    return NextResponse.json([])
  } catch (error) {
    return NextResponse.json(
      { error: '获取规则失败' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    return NextResponse.json({ success: true, data: body })
  } catch (error) {
    return NextResponse.json(
      { error: '创建规则失败' },
      { status: 500 }
    )
  }
}
