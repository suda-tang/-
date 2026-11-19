import {dictionary} from './translations-en.js';
const english={
  "opening": [
    "Why I brought these questions together",
    "I am Tang Qiuming, a postgraduate in music education at Soochow University, specialising in piano. My earlier remote MIDI ensemble system and this teaching website are separate projects. Both have made me think about the difference between representing musical time and responding musically to another phrase.\n\nWe will follow one piece through the work that has taken the most effort. Please stop and explore whenever you wish. I will distinguish functioning software from questions that still need research evidence."
  ],
  "select": [
    "Choose a piece you know",
    "Please choose a familiar piece from the full-screen library. We will keep it through the demonstration rather than switch to a prepared example for every feature.\n\nLoading starts during the record animation. Ready works open directly; unfinished material enters a queue with its identity, processing stage and failure details."
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
  "ai-library": [
    "Search your own library first",
    "This demonstration sends the current title to the workspace AI and asks for local matches. The selected work, playback position and parts provide context.\n\nMatching versions should be listed before searching online. Finding a webpage is not the same as importing a playable score. The real conversation and task result are retained."
  ],
  "ai-context": [
    "Continue without naming the piece again",
    "After the work has been established, “show numbered notation” should refer to the same piece. The model combines conversation history with current workspace state before calling the view operation.\n\nThis demonstration continues the existing conversation and really changes the view. If the user changes works, that newer state must also be taken into account."
  ],
  "ai-web": [
    "Search online when local material is insufficient",
    "An online result may be an introduction, an image directory or a login page rather than a downloadable score. Title, version and accessible material need checking.\n\nThe demonstration lists candidates without downloading or importing them. Later import steps retain their position through downloading and recognition, including situations requiring the user’s help."
  ],
  "shared-time": [
    "Change the view, keep the musical position",
    "Staff notation, numbered notation, PDF and tracks share the work’s time position. Rendering displays the score while the player owns musical time. Old layout callbacks must not pull the cursor backwards.\n\nThe demonstration switches real views, not screenshots. A work without an original PDF does not receive a fabricated page."
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
  "ai-solo": [
    "Ask the AI to identify and solo a real part",
    "This demonstration chooses from the actual parts and requests a short solo excerpt. It does not assume every work contains piano, strings or drums.\n\nThe model must resolve a musical name to a track identifier, check the range and operate the player. A promise in text is insufficient; sound, notation and mix state should agree."
  ],
  "ai-range": [
    "Play that passage again, more slowly",
    "The follow-up request keeps the previous work, sets a real measure range, lowers the tempo and starts playback. This requires conversation state, measure numbering and transport control together.\n\nPickups, meter changes and unusual imported numbering mean measure numbers are not array indices. The demonstration uses measures that actually exist."
  ],
  "mix": [
    "Return from a solo to the ensemble",
    "The demonstration restores the work’s parts and replays the same passage so the solo line can be heard in context.\n\nVolume needs to change a track’s real gain, not just a slider colour. Percussion, sustained strings and piano samples differ in recorded loudness, so equal numeric levels do not establish a balanced mix."
  ],
  "ai-chords": [
    "Check overlapping pitches before naming chords",
    "The AI is asked to analyse this score and retain the results. Timed pitch collections provide chord candidates; the explanation should not be a chord chart recalled from the title.\n\nPassing notes, suspensions and broken chords make local results ambiguous. A diminished-seventh pitch collection alone does not establish harmonic function. Candidates need locations that can be checked in the score."
  ],
  "ai-structure": [
    "Support structural analysis with score evidence",
    "Repeated material, cadences, tonal changes and texture can suggest boundaries without determining a unique formal analysis.\n\nThe request asks for measure locations and supporting evidence, with uncertain interpretations marked as candidates. A familiar title is not enough to justify a conventional form label."
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
  "classroom-design": [
    "A school music lesson is not a renamed piano lesson",
    "Primary, middle-school, secondary listening and individual piano lessons have different aims. The work, age group, requirements and measure range inform the generated sequence of listening, questions, activities and assessment.\n\nSchool pupils may not play piano. Changing an age label does not turn hand-practice instructions into a listening lesson. Requirements also need to update when the work changes."
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
    "Make “listen for thirty seconds” an actual action",
    "A listening request becomes a sequence: seek, set a range or duration, start the real player, wait for completion and resume narration. The next sentence is prepared during music; the return animation does not delay sound.\n\nPause, slide jumps and recovery need agreement between classroom and player states, rather than a timer pretending to play music."
  ],
  "classroom-interaction": [
    "Connect activity controls to the real tracks",
    "Part-listening activities, discussion and quizzes can be generated. Comparing instruments calls the workspace’s real solo and play controls. Submissions send actual answers back to classroom records.\n\nSimulated students can contribute contrasting judgements and voices, but these are not observations of real learners. The important question is whether a user response changes the next teaching action."
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
  "tasks": [
    "Give long-running work an identity and a result",
    "Upload, recognition, transcription, analysis and lesson generation may coexist. Tasks record the work, stage, progress, result and specific failure, with priority controls.\n\nProgress should reflect actual completed work. Existing scores and arrangements should be reusable; leaving a view must be distinguished from stopping the underlying job."
  ],
  "research": [
    "The question I want to study next",
    "Feedback should be considered within practice behaviour. Does a student stop to listen, repeat a phrase or simply follow highlighted blocks? Recognition uncertainty also needs separating from a playing mistake.\n\nI would compare live prompts with feedback after a phrase, holding practice time constant, then assess performance without prompts and again later. Immediate scores, dependence and lasting learning are different outcomes. This is a research proposal, not a demonstrated educational effect."
  ],
  "ai-semantic": [
    "Searching by musical conditions",
    "“With piano accompaniment,” “for secondary-school listening” and “Baroque” are different conditions. The system combines the request with titles, parts and available information rather than treating the whole sentence as a title.\n\nDirectly checkable conditions should use real library fields. Stylistic or pedagogical judgements need evidence and uncertainty. Semantic relevance does not establish every requested condition."
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
  "ai-execution": [
    "Separate response progress from execution",
    "Streaming words do not mean the requested operation has finished. Search, loading, analysis and execution can be different stages with their own work identities and results.\n\nRecovery needs completed-step records to prevent repetition. User cancellation is distinct from deleting background results. These demonstrations retain actual failures rather than play a predetermined success animation."
  ],
  "notation-layout": [
    "Adapt notation, not just the page scale",
    "A multi-instrument score needs sensible measures per line, note spacing, labels and visible parts before scale and scrolling are chosen. Numbered notation and percussion have their own layout needs.\n\nPlayback following must leave room for user control. Manually moving the page should not drag it straight back. Layout changes must remain separate from the sounding player."
  ],
  "classroom-state": [
    "Coordinate speech, pointing and writing",
    "Speech, pointing, focus, board writing, pauses and page changes share the current slide and explanation position. Completion advances the sequence; a user jump needs repositioning rather than leftover actions on a new page.\n\nSpeech preparation can happen early without highlighting the next region early. Teacher and simulated-student turns also need explicit identities."
  ],
  "recovery": [
    "Retain failures as well as results",
    "An error code rarely tells the user whether to wait, retry or replace material. Interrupted uploads, image rate limits, recognition failures and model timeouts belong to different stages and should retain their own reasons and partial results.\n\nA retry should resume appropriately without duplicating works or recognition. Users should be able to take over and continue other musical work."
  ]
};
export function registerTourEnglish(steps,direction='ensemble'){for(const step of steps){const row=step.english||english[step.id];if(!row)continue;dictionary[step[2]]=row[0];dictionary[step[3]]=row[1];}Object.assign(dictionary,{"导览目录": "Tour chapters", "演示这一项": "Run this demonstration", "再演示一次": "Run again", "正在演示": "Demonstrating", "实际操作结果": "Actual result", "停止演示": "Stop demonstration", "AI 找谱": "AI score search", "AI 连续操作": "Conversational control", "AI 音乐分析": "Music analysis", "材料与识谱": "Sources and recognition", "项目来由": "Background", "播放与声部": "Playback and parts", "生成与审听": "Generation and review", "曲谱课堂": "Score classroom", "练习与研究": "Practice and research", "任务与复用": "Tasks and reuse"});}

Object.assign(dictionary,{"研究背景":"Research background","音乐材料与识谱":"Musical materials and recognition","音乐资源检索":"Music resource retrieval","智能体交互与执行":"Agent interaction and execution","和声与曲式分析":"Harmony and form","演奏控制与声部组织":"Playback and part organisation","改编生成与音乐审查":"Arrangement and musical review","课堂设计与教学执行":"Lesson design and teaching actions","练习反馈与研究问题":"Practice feedback and research questions","任务管理与结果复用":"Task management and result reuse"});
