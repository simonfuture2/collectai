In `supabase/functions/_shared/analysisEngine.ts`, change only the Step 3 Claude request body so its `system` field becomes a cached array.

Exact change on line 385:
- From: `system: systemPrompt,`
- To:
  ```typescript
  system: [
    {
      type: "text",
      text: systemPrompt,
      cache_control: { type: "ephemeral" },
    },
  ],
  ```

Constraints respected:
- No change to the `systemPrompt` variable or its content.
- No change to `model`, `max_tokens`, headers, `messages`, or image handling.
- `verifyWithClaude` and `verifyWithGemini` are left untouched.
- Response parsing already reads `data.content`, not `data.usage`, so the new `cache_*_input_tokens` fields have no impact.

After the edit, I will redeploy the `analyze-card` and `enrich-card` edge functions so the change is live.