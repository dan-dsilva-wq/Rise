import { NextRequest } from 'next/server'
import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'

// Lazy initialize to avoid build-time errors
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
      return Response.json({ error: 'Transcription service not configured' }, { status: 500 })
    }

    const supabaseClient = await createClient()
    const { data: { user } } = await supabaseClient.auth.getUser()

    if (!user) {
      return Response.json({ error: 'Not logged in' }, { status: 401 })
    }

    const formData = await request.formData()
    const audioFile = formData.get('audio') as File | null

    if (!audioFile) {
      return Response.json({ error: 'Audio file required' }, { status: 400 })
    }
    const maxUploadBytes = 24 * 1024 * 1024
    if (audioFile.size > maxUploadBytes) {
      return Response.json(
        { error: 'Recording too large. Please send in shorter chunks.' },
        { status: 413 }
      )
    }

    const models = ['gpt-4o-transcribe', 'gpt-4o-mini-transcribe', 'whisper-1'] as const
    let lastError: unknown = null

    for (const model of models) {
      try {
        const transcription = await getOpenAI().audio.transcriptions.create({
          file: audioFile,
          model,
        })
        return Response.json({ text: transcription.text })
      } catch (error) {
        lastError = error
      }
    }

    throw lastError ?? new Error('Transcription failed')
  } catch (error) {
    console.error('Transcribe API error:', error)
    return Response.json(
      { error: error instanceof Error ? error.message : 'Transcription failed' },
      { status: 500 }
    )
  }
}
