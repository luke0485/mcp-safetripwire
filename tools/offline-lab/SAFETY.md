# Offline lab safety boundaries

- One inert tool, `lab_echo`; arguments never trigger commands, file access or network requests.
- Only fixed files under this package's `results` are written. Fake secrets and suspicious URLs are literal test strings.
- Simulated servers stop after 30 minutes; per-process limits: 500 messages, 100 calls, 64 KiB input lines.
- The stop launcher sets a persistent stop flag; prepare clears it. Disable the lab MCP in the client after stopping.
- HTTP self-tests bind only to loopback and use ephemeral ports.
- Baseline examples are synthetic fixtures, not a claim of learning accuracy.
- Client model networking is outside the lab. This is a controlled regression suite, not exhaustive penetration testing.
