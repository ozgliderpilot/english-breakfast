# Translation Bot — Goals

## The idea

A personal translation tool for a couple who regularly translate short phrases between English and Russian. Dictionaries handle single words well; phrases need a language model. Today that means opening a chat assistant and re-typing an instruction ("translate this to Russian…") every single time. The goal is to remove that friction completely: open one place, paste a phrase, get the translation back.

## Who it's for

Two people — the owner and his wife — both translating in both directions, mostly from their phones.

## How it should feel

A shared space that *is* the translation function. You paste a phrase and the translation appears beneath it. No command to remember, no instruction to type, no app to install per device. Either person can use it, and both see a shared running history of what's been translated.

## Functional requirements

- Translate short phrases between English and Russian, automatically detecting the direction.
- Translation is the default action: any phrase sent is translated with zero extra input.
- A lightweight way to mark a message as "not for translation", so the shared space can still carry the occasional human aside.
- A way to refine a result ("make it more formal", "shorter") without re-typing the phrase.
- Usable by two people at once, with each result clearly tied to the phrase that produced it.
- Reachable from mobile, anywhere, with no per-device setup.

## Non-functional requirements and constraints

- **Free to run.** No paid hosting. A negligible per-use cost (the language-model call only) is acceptable.
- **Nothing to maintain.** No server to keep alive, patch, or monitor day to day.
- **Private.** Usable only by the two intended people; not open to the public.
- **Low latency.** A translation should come back within a couple of seconds.
- **Simple.** The smallest thing that delivers the experience; no feature built before it is needed.

## Out of scope (v1)

- Languages other than English and Russian.
- Persisted history, per-person preferences, or saved glossaries.
- Correcting a translation against the original phrase, as opposed to adjusting the result that was produced.
