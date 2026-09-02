import { createServer, IncomingMessage, Server, ServerResponse } from 'http';
import { AddressInfo } from 'net';
import { buildMonoWav } from '../src/modules/call-analysis/audio/wav-channels.util';
import { AnthropicLlmProvider } from '../src/modules/call-analysis/providers/llm/anthropic-llm.provider';
import { OpenAiCompatibleLlmProvider } from '../src/modules/call-analysis/providers/llm/openai-compatible-llm.provider';
import { OpenAiCompatibleSttProvider } from '../src/modules/call-analysis/providers/stt/openai-compatible-stt.provider';

/**
 * 진짜 소켓으로 한 번 왕복한다.
 *
 * 단위 테스트는 fetch 를 갈아끼우므로 멀티파트가 실제로 직렬화되는지, 헤더가 진짜 나가는지를
 * 증명하지 못한다. 실 프로바이더에서 제일 자주 틀리는 지점이 거기라서 여기서 별도로 본다.
 */
describe('통화 분석 실 프로바이더 — HTTP 왕복', () => {
  let server: Server;
  let baseUrl: string;
  let lastRequest: { path: string; headers: IncomingMessage['headers']; body: Buffer };
  let respond: (res: ServerResponse) => void;

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk) => chunks.push(chunk as Buffer));
      req.on('end', () => {
        lastRequest = { path: req.url ?? '', headers: req.headers, body: Buffer.concat(chunks) };
        respond(res);
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  function replyJson(body: unknown, status = 200) {
    respond = (res) => {
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
  }

  it('STT 는 WAV 를 멀티파트로 올리고 verbose_json 을 되받는다', async () => {
    replyJson({
      text: '네 안녕하세요',
      segments: [{ start: 0, end: 1.5, text: '네 안녕하세요', avg_logprob: -0.15 }],
    });

    // 8kHz 16bit 모노 0.5초.
    const wav = buildMonoWav(Buffer.alloc(8000), { sampleRate: 8000, bitsPerSample: 16 });
    const provider = new OpenAiCompatibleSttProvider({
      name: 'local',
      endpoint: baseUrl,
      model: 'faster-whisper-large-v3',
      apiKey: null,
      timeoutMs: 10_000,
    });

    const result = await provider.transcribe({
      audio: wav,
      sampleRate: 8000,
      bitsPerSample: 16,
      language: 'ko',
      speaker: 'CUSTOMER',
    });

    expect(lastRequest.path).toBe('/v1/audio/transcriptions');
    expect(lastRequest.headers['content-type']).toMatch(/^multipart\/form-data; boundary=/);
    expect(lastRequest.headers.authorization).toBeUndefined();

    const raw = lastRequest.body.toString('latin1');
    expect(raw).toContain('name="model"');
    expect(raw).toContain('faster-whisper-large-v3');
    expect(raw).toContain('name="language"');
    expect(raw).toContain('name="response_format"');
    expect(raw).toContain('verbose_json');
    expect(raw).toContain('filename="call.wav"');
    // 파일 본문이 잘리지 않고 통째로 실렸는지 — WAV 헤더와 크기로 본다.
    expect(raw).toContain('RIFF');
    expect(lastRequest.body.length).toBeGreaterThan(wav.length);

    expect(result.text).toBe('네 안녕하세요');
    expect(result.segments).toEqual([
      { speaker: 'CUSTOMER', startMs: 0, endMs: 1500, text: '네 안녕하세요', confidence: expect.closeTo(0.861, 2) },
    ]);
  });

  it('OpenAI 호환 LLM 은 JSON 본문과 Bearer 를 실제로 보낸다', async () => {
    replyJson({ model: 'qwen2.5-7b', choices: [{ message: { content: '{"summary":"요약"}' } }] });

    const provider = new OpenAiCompatibleLlmProvider({
      name: 'local',
      endpoint: `${baseUrl}/v1`,
      model: 'qwen2.5-7b-instruct',
      apiKey: 'local-key',
      timeoutMs: 10_000,
    });

    const result = await provider.complete({
      system: '분석기', user: '전문', maxTokens: 256, responseFormat: 'json',
    });

    expect(lastRequest.path).toBe('/v1/chat/completions');
    expect(lastRequest.headers['content-type']).toBe('application/json');
    expect(lastRequest.headers.authorization).toBe('Bearer local-key');
    expect(JSON.parse(lastRequest.body.toString('utf8'))).toMatchObject({
      model: 'qwen2.5-7b-instruct',
      max_tokens: 256,
      response_format: { type: 'json_object' },
    });
    expect(result).toEqual({ text: '{"summary":"요약"}', modelName: 'qwen2.5-7b' });
  });

  it('Anthropic 은 x-api-key 로 인증한다 — Bearer 가 아니다', async () => {
    replyJson({ model: 'claude-sonnet-5', content: [{ type: 'text', text: '{"summary":"요약"}' }] });

    const provider = new AnthropicLlmProvider({
      endpoint: baseUrl, model: 'claude-sonnet-5', apiKey: 'sk-ant-x', timeoutMs: 10_000,
    });

    const result = await provider.complete({ system: '분석기', user: '전문', maxTokens: 256 });

    expect(lastRequest.path).toBe('/v1/messages');
    expect(lastRequest.headers['x-api-key']).toBe('sk-ant-x');
    expect(lastRequest.headers['anthropic-version']).toBe('2023-06-01');
    expect(lastRequest.headers.authorization).toBeUndefined();
    expect(result.text).toBe('{"summary":"요약"}');
  });

  it('서버가 500 을 주면 어느 프로바이더가 무엇을 돌려줬는지 남는다', async () => {
    respond = (res) => {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end('CUDA out of memory');
    };

    const provider = new OpenAiCompatibleLlmProvider({
      name: 'local', endpoint: baseUrl, model: 'm', apiKey: null, timeoutMs: 10_000,
    });

    await expect(provider.complete({ system: 's', user: 'u', maxTokens: 8 }))
      .rejects.toThrow('local LLM returned 500: CUDA out of memory');
  });

  it('서버가 응답을 안 주면 타임아웃으로 끊는다 — sweep 이 통째로 멈추지 않게', async () => {
    respond = () => {
      /* 일부러 응답하지 않는다 */
    };

    const provider = new OpenAiCompatibleLlmProvider({
      name: 'local', endpoint: baseUrl, model: 'm', apiKey: null, timeoutMs: 300,
    });

    await expect(provider.complete({ system: 's', user: 'u', maxTokens: 8 }))
      .rejects.toThrow('local LLM timed out after 300ms');
  });
});
