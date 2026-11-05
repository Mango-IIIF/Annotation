<script lang="ts">
  import Sidebar from '../src/sidebar/Sidebar.svelte';
  import { emptyDraft } from '../src/annotations/intents';
  let { onsave = () => {} } = $props();
  let start = $state('3452.48');
  let end = $state('');
  let draft = $state(emptyDraft());
  let language = $state('en');
</script>
<Sidebar kind="av" languages={['en']} bind:draft bind:language bind:start bind:end
  currentTime={3452.6} playbackReady={true} editing={false} error="" providers={[]}
  cards={[]} {onsave} oncancel={() => {}} onedit={() => {}} ondelete={() => {}} onlocate={() => {}}
/>
<output data-testid="start">{start}</output>
<output data-testid="end">{end}</output>
<button onclick={() => { start = '3725'; end = '3800.125'; }}>Load range</button>
