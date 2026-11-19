// Existing English narration retained while the Chinese manuscript is revised.
export const audienceEnglish={
  "education": {
    "opening": [
      "Why I started this project",
      "I am Tang Qiuming, a piano-focused music education master’s student at Soochow University, applying for doctoral study in 2027. Hearing AI-generated music first drew me to the technology; classroom practice made me ask what it actually helps students understand. This tour follows one work through the system and distinguishes working demonstrations from research questions."
    ],
    "select": [
      "Choose a familiar work",
      "Choose a familiar work from the fullscreen library. We keep that same version throughout the demonstrations so that changes in sound and teaching activity can be checked against a stable musical reference."
    ],
    "ai-library": [
      "Anchor the question to a work",
      "A student may recognise a recurring figure. First we must identify the work and passage. This demonstration searches the actual library; cross-work motif attribution would additionally require a verified corpus, melodic matching and source evidence."
    ],
    "ai-context": [
      "Keep the musical context",
      "Classroom follow-up questions depend on the work, passage and parts already under discussion. Here the agent changes the notation view while retaining the current work; the visible result is checked alongside its reply."
    ],
    "ai-solo": [
      "Make part listening audible",
      "The agent isolates an actual part from the current score. Students can compare it with the ensemble. Symbolic-track isolation is different from source separation of a mixed recording; neither justifies inventing an instrument that is absent."
    ],
    "ai-range": [
      "Listen to a bounded passage",
      "The agent selects a real passage, changes its tempo and plays it. The same musical operation can support repetition counting, timbre comparison or evidence-based analysis at different school levels."
    ],
    "ai-chords": [
      "Check an explanation against the score",
      "Chord candidates should point back to passages that can be inspected and heard. Passing notes, suspensions and missing key signatures require careful interpretation rather than confident labels."
    ],
    "ai-structure": [
      "Establish evidence before naming a theme",
      "A request about a second theme and answering trumpets requires work identity, formal boundaries, instrumentation and repeated figures. This demonstration examines the current score; uncertain boundaries remain candidates for teacher review."
    ],
    "classroom-design": [
      "Let teaching conditions shape the lesson",
      "The work, passage, school level, lesson type and teacher’s requirements shape the plan. A complete script and slides are useful preparation, but curricular alignment and suitability for a particular class still need teacher judgement."
    ],
    "classroom-evidence": [
      "Trace a teaching claim to its measures",
      "Meter, notes, durations, parts and the chosen range provide evidence before lesson generation. The whole-work option must refer to actual score records, not a fixed opening excerpt.\n\nNarration needs checks against those facts. Recognition errors can propagate into teaching, which is why source comparison and teacher review remain necessary."
    ],
    "classroom-slides": [
      "Photographs and score diagrams have different sources",
      "Relevant portraits, instruments and background photographs are retrieved online and embedded. Melodic, rhythmic and part diagrams are drawn from score data. They must not be presented as interchangeable sources.\n\nText, pictures and spoken regions retain identifiers for pointing. Slides need visual space rather than a shrunken lesson-plan essay. Sources remain in records and export notes."
    ],
    "classroom-actions": [
      "A listening instruction must trigger music",
      "A listening activity must locate and play the real work, wait for completion, and return to the lesson. Embedded listening games should control the same tracks rather than an unrelated demonstration player."
    ],
    "classroom-state": [
      "Coordinate speech, pointing and writing",
      "Speech, pointing, focus, board writing, pauses and page changes share the current slide and explanation position. Completion advances the sequence; a user jump needs repositioning rather than leftover actions on a new page.\n\nSpeech preparation can happen early without highlighting the next region early. Teacher and simulated-student turns also need explicit identities."
    ],
    "classroom-interaction": [
      "Leave room for real students",
      "Simulated students and assistants can introduce questions and alternative views. Their generated responses are not evidence of real learning. The important observations concern how actual students listen, justify and revise their judgements."
    ],
    "classroom-materials": [
      "Bring your own plans and listening material",
      "Uploaded plans, pictures and audio are attached to the selected work. Online lesson references require work matching and readable content; a search title alone is insufficient.\n\nMaterials and lesson fragments can appear progressively. Teachers can edit and export the result. Long-running generation remains in the background rather than disappearing when the interface changes."
    ],
    "practice": [
      "Look beyond the score",
      "Practice feedback is useful only if we understand what students do next. Recognition uncertainty must be separated from learner errors, and immediate correction must be distinguished from lasting, independent judgement."
    ],
    "practice-plan": [
      "Ask for a plan using real measure ranges",
      "The AI proposes sections for the current work, using measures that exist, and sends the suggestion to practice settings for review.\n\nAn articulate plan is not proof that the controls were configured correctly. Invalid ranges must be rejected. Applying the proposal and enabling the microphone remain the user’s decisions."
    ],
    "source-check": [
      "What to check after recognition",
      "Playable recognition is not necessarily accurate recognition. Check meter, hands and measure boundaries against the original, then listen for unwritten gaps. This project has misread 4/4 as 4/2 and added silence when joining pages.\n\nKeeping the source beside the electronic score makes those errors traceable. They must not be counted as student mistakes. The demonstration opens the original when this work has one."
    ],
    "inputs": [
      "Different inputs need different treatment",
      "Pages contain printed symbols; MIDI contains pitches, times and instrument messages; recordings contain overlapping sound. They lack different kinds of information and need different processing.\n\nThe resulting representations are attached to one work, with their sources retained. A score, original document and vocal track can then be compared without merging unrelated files just because their names match."
    ],
    "photo-scan": [
      "Prepare photographed pages before recognition",
      "Photographs introduce perspective, shadows, background and page order before we even reach the notes. The import process prepares page boundaries and orientation, and lets users arrange the pages before recognition.\n\nAn attractive scan can still be wrong if cropping removes a clef or barline. Source retention and reprocessing matter more than producing a tidy monochrome image."
    ],
    "numbered-import": [
      "Numbered notation has its own musical syntax",
      "Digits are only one layer of numbered notation. Octave dots, duration lines, augmentation dots, ties and part relationships change what sounds. These marks must become timed notes before the result can share a player with staff notation.\n\nThe goal is formal, multipart notation rather than a row of numbers. Blurred or connected marks still need checking before the result can guide practice assessment."
    ],
    "recording-import": [
      "Recover onsets, then the beat",
      "A recording transcription must estimate which pitches sound together and how long they last. Piano harmonics, sustain pedal and mixed instruments can split one onset or merge adjacent notes.\n\nPitch estimates therefore need rhythmic and part organisation. Separating a mixed recording can help but can also introduce artefacts. I treat the output as an editable first draft, especially its rhythm."
    ],
    "score-memory": [
      "What remains after a score has been processed",
      "A work record associates uploaded sources, recognition results, arrangements and attached audio. Reopening should reuse completed work rather than recognise the piece again. Recent client state can also reduce repeated layout.\n\nA changed source or recognition method can invalidate that reuse. Every background result needs a work identity so that a late result cannot overwrite the piece opened more recently."
    ],
    "library-intelligence": [
      "Ask for a different way to organise the library",
      "The same works can be grouped by composer, period, instrument or teaching use. OCR titles and matching cover art provide clues, not proof of identity.\n\nThe classification feature takes the user’s organising request and maps the model’s groups back to real library entries. Pending works must remain distinguishable from immediately playable results."
    ],
    "ai-semantic": [
      "Searching by musical conditions",
      "“With piano accompaniment,” “for secondary-school listening” and “Baroque” are different conditions. The system combines the request with titles, parts and available information rather than treating the whole sentence as a title.\n\nDirectly checkable conditions should use real library fields. Stylistic or pedagogical judgements need evidence and uncertainty. Semantic relevance does not establish every requested condition."
    ],
    "ai-web": [
      "Search online when local material is insufficient",
      "An online result may be an introduction, an image directory or a login page rather than a downloadable score. Title, version and accessible material need checking.\n\nThe demonstration lists candidates without downloading or importing them. Later import steps retain their position through downloading and recognition, including situations requiring the user’s help."
    ],
    "shared-time": [
      "Change the view, keep the musical position",
      "Staff notation, numbered notation, PDF and tracks share the work’s time position. Rendering displays the score while the player owns musical time. Old layout callbacks must not pull the cursor backwards.\n\nThe demonstration switches real views, not screenshots. A work without an original PDF does not receive a fabricated page."
    ],
    "notation-layout": [
      "Adapt notation, not just the page scale",
      "A multi-instrument score needs sensible measures per line, note spacing, labels and visible parts before scale and scrolling are chosen. Numbered notation and percussion have their own layout needs.\n\nPlayback following must leave room for user control. Manually moving the page should not drag it straight back. Layout changes must remain separate from the sounding player."
    ],
    "part-identity": [
      "Keep a part’s identity from import to sound",
      "MIDI tracks, channels and programs need to resolve to actual instruments. Staff and voice assignment are additional notation problems. Simultaneous notes should not collapse both hands, and percussion should not enter the piano bass staff.\n\nThe same identities support labels, tracks, solo and mute. An instrument label is meaningful only if the corresponding sound is actually played."
    ],
    "daw": [
      "See how parts enter in the track view",
      "Tracks use horizontal position for time and note height for pitch. Entries, sustained notes and overlapping parts can be compared directly; attached vocals are represented as a waveform.\n\nThe demonstration opens this work’s tracks. Mute, solo and volume share player state. Zoom changes what is visible, not the music’s tempo or pitch."
    ],
    "vocal": [
      "Why a recording can run ahead of a score",
      "Attached audio has its own timeline while notation advances in beats. Leading silence, overall tempo differences and local timing changes can all cause misalignment. Starting both files together is often insufficient.\n\nThe vocal track follows the work and provides fine offset adjustment. It should not be repeatedly chopped to force alignment and swallow syllables. Onsets and phrase endings still need listening."
    ],
    "expression": [
      "Shape expression without destabilising the beat",
      "Imported scores may already contain dynamics, tempo changes and articulation. Preserve those before adding interpretation where information is absent.\n\nRandom delays on individual notes can make accompaniment stumble. Reliable beat positions come before shaping dynamics, articulation and phrase endings. Generated expression should be saved for comparison and reviewed by listening."
    ],
    "ai-tools": [
      "Validate model-proposed operations",
      "Conversation proposes actions, then the workspace checks scores, measures, parts and parameters. Player, notation and practice controls retain their own actual state; a model statement cannot establish success.\n\nExecution results feed back into the conversation. Invalid parameters can be corrected without repeating successful steps. Parsing and recovery also matter when the proposed action format is malformed."
    ],
    "ai-mix": [
      "Adjust the balance in words",
      "The demonstration asks the AI to lower a real part and play a short existing passage. The instrument name must resolve to a track and its actual gain, rather than just a shorter slider.\n\nThis supports listening and arrangement review. The demonstrated level is a comparison condition, not a universal mixing target."
    ],
    "ai-tempo": [
      "Combine position, tempo and playback",
      "This request combines a real measure range, tempo and playback. The work and range need resolution before tempo and transport changes, without reloading away the position.\n\nSlower practice should preserve pitch, meter changes and written timing relationships. The excerpt stops afterwards so the resulting controls can be inspected."
    ],
    "mix": [
      "Return from a solo to the ensemble",
      "The demonstration restores the work’s parts and replays the same passage so the solo line can be heard in context.\n\nVolume needs to change a track’s real gain, not just a slider colour. Percussion, sustained strings and piano samples differ in recorded loudness, so equal numeric levels do not establish a balanced mix."
    ],
    "ai-execution": [
      "Separate response progress from execution",
      "Streaming words do not mean the requested operation has finished. Search, loading, analysis and execution can be different stages with their own work identities and results.\n\nRecovery needs completed-step records to prevent repetition. User cancellation is distinct from deleting background results. These demonstrations retain actual failures rather than play a predetermined success animation."
    ],
    "arrange": [
      "Decide who the arrangement is for",
      "Ensemble, instrument count, range and difficulty constrain generation. Melody, bass and inner parts need roles; replacing timbres on identical notes is not sufficient orchestration.\n\nThe guide shows conditions and existing results without automatically starting a lengthy generation or overwriting the original. The user can decide whether to submit a new request."
    ],
    "arrangement-review": [
      "Review the generated score part by part",
      "Some individual generated lines sound plausible yet become crowded together. Range checking is only a start; harmonic conflict, entries and masking also matter.\n\nEach instrument needs an identified staff, with independent percussion notation. Soloing and muting support review. Task completion cannot be treated as proof of musical quality."
    ],
    "drums": [
      "Let drums support the beat before adding fills",
      "Drums should not strike with every piano note. The beat structure belongs at measure and phrase level, with timbre, accent and suitable fills supporting changes.\n\nFills need room for the melody. Separate percussion notation makes it possible to inspect hit times and hear the interaction with bass and accompaniment. Saved versions support repeated comparison."
    ],
    "fingering": [
      "Fingering must consider the notes that follow",
      "Suggestions need pitch distances, hands, chords and connected movements. Choosing a finger independently for every note can leave no workable continuation.\n\nSuggestions should be attached to actual notes and remain editable. Hand shape, tempo, touch and habits affect choices, so there is no single fingering guaranteed for everyone."
    ],
    "tasks": [
      "Give long-running work an identity and a result",
      "Upload, recognition, transcription, analysis and lesson generation may coexist. Tasks record the work, stage, progress, result and specific failure, with priority controls.\n\nProgress should reflect actual completed work. Existing scores and arrangements should be reusable; leaving a view must be distinguished from stopping the underlying job."
    ],
    "recovery": [
      "Retain failures as well as results",
      "An error code rarely tells the user whether to wait, retry or replace material. Interrupted uploads, image rate limits, recognition failures and model timeouts belong to different stages and should retain their own reasons and partial results.\n\nA retry should resume appropriately without duplicating works or recognition. Users should be able to take over and continue other musical work."
    ],
    "research": [
      "The doctoral question I want to pursue",
      "Does actionable, passage-specific feedback strengthen independent musical judgement, or increase reliance on prompts? I want to compare feedback timing and granularity under controlled teaching conditions, using actual student explanations, revisions and delayed performance."
    ]
  },
  "technology": {
    "opening": [
      "Follow a request through the system",
      "I am Tang Qiuming, a music education master’s student at Soochow University applying for doctoral study in 2027. This route examines how model output, symbolic scores, playback and classroom actions remain consistent, distinguishing existing model foundations from project-specific integration and verification."
    ],
    "select": [
      "Choose a piece you know",
      "Please choose a familiar piece from the full-screen library. We will keep it through the demonstration rather than switch to a prepared example for every feature.\n\nLoading starts during the record animation. Ready works open directly; unfinished material enters a queue with its identity, processing stage and failure details."
    ],
    "inputs": [
      "Represent sources through a versioned work",
      "Images, symbolic files and audio expose different information. They are processed separately and linked to a work version, preserving provenance and identifying which derived analyses and layouts become stale after an update."
    ],
    "recording-import": [
      "Separate transcription from quantisation",
      "Models may operate on spectral or compressed representations rather than individual waveform samples. Here continuous note estimates must become beats, measures and parts; separation artefacts and quantisation errors need distinct evaluation."
    ],
    "shared-time": [
      "Keep musical, audio and visual time distinct",
      "Musical events define beat positions and durations; a tempo map converts them to seconds, while engraving supplies coordinates. View changes should not rebuild transport time. Polyphony and tempo changes must be restored before visual following is considered."
    ],
    "part-identity": [
      "Keep stable part identities",
      "Track labels, MIDI channels, staves and parts are different concepts. Mixing controls must address stable part IDs so that layout changes cannot redirect an operation to another instrument."
    ],
    "ai-tools": [
      "Use typed actions with musical parameters",
      "The planner reads the current work, actual parts and valid measures. Typed actions separate explanation from execution, and long tasks retain a visible identity. Model fluency does not grant unrestricted system authority."
    ],
    "ai-library": [
      "Search your own library first",
      "This demonstration sends the current title to the workspace AI and asks for local matches. The selected work, playback position and parts provide context.\n\nMatching versions should be listed before searching online. Finding a webpage is not the same as importing a playable score. The real conversation and task result are retained."
    ],
    "ai-context": [
      "Continue without naming the piece again",
      "After the work has been established, “show numbered notation” should refer to the same piece. The model combines conversation history with current workspace state before calling the view operation.\n\nThis demonstration continues the existing conversation and really changes the view. If the user changes works, that newer state must also be taken into account."
    ],
    "ai-execution": [
      "Verify results and bound recovery",
      "The executor reads back work, part selection, tempo and playback state. Idempotent operations should succeed without unnecessary changes; failed plans receive bounded repair rather than repeated or falsely completed actions."
    ],
    "ai-solo": [
      "Ask the AI to identify and solo a real part",
      "This demonstration chooses from the actual parts and requests a short solo excerpt. It does not assume every work contains piano, strings or drums.\n\nThe model must resolve a musical name to a track identifier, check the range and operate the player. A promise in text is insufficient; sound, notation and mix state should agree."
    ],
    "ai-range": [
      "Play that passage again, more slowly",
      "The follow-up request keeps the previous work, sets a real measure range, lowers the tempo and starts playback. This requires conversation state, measure numbering and transport control together.\n\nPickups, meter changes and unusual imported numbering mean measure numbers are not array indices. The demonstration uses measures that actually exist."
    ],
    "ai-chords": [
      "Distinguish pitch evidence from harmony",
      "Pitch-class statistics do not establish simultaneity or harmonic function. Candidates must consider note overlap and point back to measures; an absent key signature is neither analysis failure nor proof of C major."
    ],
    "ai-structure": [
      "Decompose a compound musical request",
      "A request about answering trumpets in a second theme combines retrieval, instrumentation, form, motif relations and bounded playback. Current demonstrations use the chosen score; arbitrary cross-corpus motif matching requires its own representation, algorithms and benchmark."
    ],
    "classroom-design": [
      "Bind generated lessons to executable state",
      "Lesson generation receives a versioned work and teaching conditions, producing slides, interaction and actions. Late results must remain bound to their original work rather than controlling a newly selected score."
    ],
    "classroom-evidence": [
      "Trace a teaching claim to its measures",
      "Meter, notes, durations, parts and the chosen range provide evidence before lesson generation. The whole-work option must refer to actual score records, not a fixed opening excerpt.\n\nNarration needs checks against those facts. Recognition errors can propagate into teaching, which is why source comparison and teacher review remain necessary."
    ],
    "classroom-actions": [
      "Bridge classroom actions to the real player",
      "A restricted protocol checks the source, channel, work and part IDs, then returns actual player state. Listening completion and cancellation must follow transport events rather than an unrelated timer or simulated success."
    ],
    "classroom-interaction": [
      "Connect activity controls to the real tracks",
      "Part-listening activities, discussion and quizzes can be generated. Comparing instruments calls the workspace’s real solo and play controls. Submissions send actual answers back to classroom records.\n\nSimulated students can contribute contrasting judgements and voices, but these are not observations of real learners. The important question is whether a user response changes the next teaching action."
    ],
    "tasks": [
      "Make long-running work observable",
      "Uploads, recognition and generation have different completion boundaries. Task identity, bounded concurrency, cancellation and version checks keep foreground interaction separate from background work without inventing precise progress."
    ],
    "recovery": [
      "Locate the first inconsistency",
      "Trace mismatches through source data, symbolic events, scheduling, sound and presentation. Agent failures require a separate trace through plan, arguments, execution and verification. Performance evaluation should distinguish first paint, interaction, first sound, engraving and memory."
    ],
    "source-check": [
      "What to check after recognition",
      "Playable recognition is not necessarily accurate recognition. Check meter, hands and measure boundaries against the original, then listen for unwritten gaps. This project has misread 4/4 as 4/2 and added silence when joining pages.\n\nKeeping the source beside the electronic score makes those errors traceable. They must not be counted as student mistakes. The demonstration opens the original when this work has one."
    ],
    "photo-scan": [
      "Prepare photographed pages before recognition",
      "Photographs introduce perspective, shadows, background and page order before we even reach the notes. The import process prepares page boundaries and orientation, and lets users arrange the pages before recognition.\n\nAn attractive scan can still be wrong if cropping removes a clef or barline. Source retention and reprocessing matter more than producing a tidy monochrome image."
    ],
    "numbered-import": [
      "Numbered notation has its own musical syntax",
      "Digits are only one layer of numbered notation. Octave dots, duration lines, augmentation dots, ties and part relationships change what sounds. These marks must become timed notes before the result can share a player with staff notation.\n\nThe goal is formal, multipart notation rather than a row of numbers. Blurred or connected marks still need checking before the result can guide practice assessment."
    ],
    "score-memory": [
      "What remains after a score has been processed",
      "A work record associates uploaded sources, recognition results, arrangements and attached audio. Reopening should reuse completed work rather than recognise the piece again. Recent client state can also reduce repeated layout.\n\nA changed source or recognition method can invalidate that reuse. Every background result needs a work identity so that a late result cannot overwrite the piece opened more recently."
    ],
    "library-intelligence": [
      "Ask for a different way to organise the library",
      "The same works can be grouped by composer, period, instrument or teaching use. OCR titles and matching cover art provide clues, not proof of identity.\n\nThe classification feature takes the user’s organising request and maps the model’s groups back to real library entries. Pending works must remain distinguishable from immediately playable results."
    ],
    "ai-semantic": [
      "Searching by musical conditions",
      "“With piano accompaniment,” “for secondary-school listening” and “Baroque” are different conditions. The system combines the request with titles, parts and available information rather than treating the whole sentence as a title.\n\nDirectly checkable conditions should use real library fields. Stylistic or pedagogical judgements need evidence and uncertainty. Semantic relevance does not establish every requested condition."
    ],
    "ai-web": [
      "Search online when local material is insufficient",
      "An online result may be an introduction, an image directory or a login page rather than a downloadable score. Title, version and accessible material need checking.\n\nThe demonstration lists candidates without downloading or importing them. Later import steps retain their position through downloading and recognition, including situations requiring the user’s help."
    ],
    "notation-layout": [
      "Adapt notation, not just the page scale",
      "A multi-instrument score needs sensible measures per line, note spacing, labels and visible parts before scale and scrolling are chosen. Numbered notation and percussion have their own layout needs.\n\nPlayback following must leave room for user control. Manually moving the page should not drag it straight back. Layout changes must remain separate from the sounding player."
    ],
    "daw": [
      "See how parts enter in the track view",
      "Tracks use horizontal position for time and note height for pitch. Entries, sustained notes and overlapping parts can be compared directly; attached vocals are represented as a waveform.\n\nThe demonstration opens this work’s tracks. Mute, solo and volume share player state. Zoom changes what is visible, not the music’s tempo or pitch."
    ],
    "vocal": [
      "Why a recording can run ahead of a score",
      "Attached audio has its own timeline while notation advances in beats. Leading silence, overall tempo differences and local timing changes can all cause misalignment. Starting both files together is often insufficient.\n\nThe vocal track follows the work and provides fine offset adjustment. It should not be repeatedly chopped to force alignment and swallow syllables. Onsets and phrase endings still need listening."
    ],
    "expression": [
      "Shape expression without destabilising the beat",
      "Imported scores may already contain dynamics, tempo changes and articulation. Preserve those before adding interpretation where information is absent.\n\nRandom delays on individual notes can make accompaniment stumble. Reliable beat positions come before shaping dynamics, articulation and phrase endings. Generated expression should be saved for comparison and reviewed by listening."
    ],
    "ai-mix": [
      "Adjust the balance in words",
      "The demonstration asks the AI to lower a real part and play a short existing passage. The instrument name must resolve to a track and its actual gain, rather than just a shorter slider.\n\nThis supports listening and arrangement review. The demonstrated level is a comparison condition, not a universal mixing target."
    ],
    "ai-tempo": [
      "Combine position, tempo and playback",
      "This request combines a real measure range, tempo and playback. The work and range need resolution before tempo and transport changes, without reloading away the position.\n\nSlower practice should preserve pitch, meter changes and written timing relationships. The excerpt stops afterwards so the resulting controls can be inspected."
    ],
    "mix": [
      "Return from a solo to the ensemble",
      "The demonstration restores the work’s parts and replays the same passage so the solo line can be heard in context.\n\nVolume needs to change a track’s real gain, not just a slider colour. Percussion, sustained strings and piano samples differ in recorded loudness, so equal numeric levels do not establish a balanced mix."
    ],
    "arrange": [
      "Decide who the arrangement is for",
      "Ensemble, instrument count, range and difficulty constrain generation. Melody, bass and inner parts need roles; replacing timbres on identical notes is not sufficient orchestration.\n\nThe guide shows conditions and existing results without automatically starting a lengthy generation or overwriting the original. The user can decide whether to submit a new request."
    ],
    "arrangement-review": [
      "Review the generated score part by part",
      "Some individual generated lines sound plausible yet become crowded together. Range checking is only a start; harmonic conflict, entries and masking also matter.\n\nEach instrument needs an identified staff, with independent percussion notation. Soloing and muting support review. Task completion cannot be treated as proof of musical quality."
    ],
    "drums": [
      "Let drums support the beat before adding fills",
      "Drums should not strike with every piano note. The beat structure belongs at measure and phrase level, with timbre, accent and suitable fills supporting changes.\n\nFills need room for the melody. Separate percussion notation makes it possible to inspect hit times and hear the interaction with bass and accompaniment. Saved versions support repeated comparison."
    ],
    "classroom-slides": [
      "Photographs and score diagrams have different sources",
      "Relevant portraits, instruments and background photographs are retrieved online and embedded. Melodic, rhythmic and part diagrams are drawn from score data. They must not be presented as interchangeable sources.\n\nText, pictures and spoken regions retain identifiers for pointing. Slides need visual space rather than a shrunken lesson-plan essay. Sources remain in records and export notes."
    ],
    "classroom-state": [
      "Coordinate speech, pointing and writing",
      "Speech, pointing, focus, board writing, pauses and page changes share the current slide and explanation position. Completion advances the sequence; a user jump needs repositioning rather than leftover actions on a new page.\n\nSpeech preparation can happen early without highlighting the next region early. Teacher and simulated-student turns also need explicit identities."
    ],
    "classroom-materials": [
      "Bring your own plans and listening material",
      "Uploaded plans, pictures and audio are attached to the selected work. Online lesson references require work matching and readable content; a search title alone is insufficient.\n\nMaterials and lesson fragments can appear progressively. Teachers can edit and export the result. Long-running generation remains in the background rather than disappearing when the interface changes."
    ],
    "practice": [
      "Choose a practice target before enabling the microphone",
      "Range, instrument and tempo define the target. Microphone access is initiated by the user; polyphonic listening is then compared with the chosen part and score time. Following a varying performance cannot rely only on fixed seconds.\n\nPedal, soft notes and background sound introduce uncertainty. The guide lets users inspect settings without activating recording."
    ],
    "fingering": [
      "Fingering must consider the notes that follow",
      "Suggestions need pitch distances, hands, chords and connected movements. Choosing a finger independently for every note can leave no workable continuation.\n\nSuggestions should be attached to actual notes and remain editable. Hand shape, tempo, touch and habits affect choices, so there is no single fingering guaranteed for everyone."
    ],
    "practice-plan": [
      "Ask for a plan using real measure ranges",
      "The AI proposes sections for the current work, using measures that exist, and sends the suggestion to practice settings for review.\n\nAn articulate plan is not proof that the controls were configured correctly. Invalid ranges must be rejected. Applying the proposal and enabling the microphone remain the user’s decisions."
    ],
    "research": [
      "The system question I want to test",
      "Can score-grounded planning plus execution-state verification reduce propagation of incorrect actions and explanations? Ablations should measure completion, recovery, repeated execution, latency and resource costs before educational benefit is inferred."
    ]
  }
};
