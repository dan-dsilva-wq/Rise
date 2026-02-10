import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

let openai: OpenAI | null = null
function getOpenAI() {
  if (!openai) {
    openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })
  }
  return openai
}

export async function POST(request: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return Response.json({ error: 'TTS service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const { text }: { text: string } = await request.json()

    if (!text) {
      return Response.json({ error: 'Text required' }, { status: 400 })
    }

    const voice = (process.env.OPENAI_TTS_VOICE || 'nova') as 'nova' | 'alloy' | 'echo' | 'fable' | 'onyx' | 'shimmer'

    const response = await getOpenAI().audio.speech.create({
      model: 'tts-1',
      voice,
      input: text,
    })

    const audioBuffer = await response.arrayBuffer()

    return new Response(audioBuffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Speak API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'TTS failed' },
      { status: 500 }
    )
  }
}
