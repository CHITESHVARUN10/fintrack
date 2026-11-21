import { Fragment } from 'react'

// Renders the inline `code` spans that already exist in the Docs and Privacy
// copy, so the stored text stays plain and the presentation matches the
// prototype's code styling.
export function CodeText({ text }: { text: string }) {
  const parts = text.split(/(`[^`]+`)/)
  return (
    <>
      {parts.map((part, index) =>
        part.length > 2 && part.startsWith('`') && part.endsWith('`') ? (
          <code key={index}>{part.slice(1, -1)}</code>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        ),
      )}
    </>
  )
}
