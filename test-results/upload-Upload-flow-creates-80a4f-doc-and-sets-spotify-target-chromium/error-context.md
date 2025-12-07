# Page snapshot

```yaml
- generic [ref=e1]:
  - heading "Upload E2E Test Page" [level=1] [ref=e2]
  - generic [ref=e3]:
    - text: Title
    - textbox "Title" [ref=e4]: Playwright E2E 1765139020692
  - generic [ref=e5]:
    - text: Description
    - textbox "Description" [ref=e6]: Playwright test upload
  - generic [ref=e7]:
    - text: URL
    - textbox "URL" [ref=e8]: https://example.com/e2e.mp4
  - generic [ref=e9]:
    - text: Type
    - combobox "Type" [ref=e10]:
      - option "video" [selected]
      - option "image"
      - option "audio"
  - generic [ref=e11]:
    - checkbox "Publish to YouTube" [checked] [ref=e12]
    - text: Publish to YouTube
  - generic [ref=e13]:
    - checkbox "Publish to Spotify" [checked] [ref=e14]
    - text: Publish to Spotify
  - generic [ref=e15]:
    - text: Schedule (ISO datetime)
    - textbox "Schedule (ISO datetime)" [ref=e16]
  - button "Submit" [active] [ref=e17]
  - generic [ref=e18]: "{ \"status\": 500, \"body\": { \"error\": \"internal_error\" } }"
```