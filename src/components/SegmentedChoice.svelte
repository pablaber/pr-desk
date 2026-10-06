<script lang="ts" generics="T extends string | number">
  let {
    name,
    value,
    options,
    onchange,
  }: {
    name: string;
    value: T;
    options: { value: T; label: string }[];
    onchange: (value: T) => void;
  } = $props();
</script>

<div class="segmented-control">
  {#each options as option (option.value)}
    <label
      ><input
        type="radio"
        {name}
        value={option.value}
        checked={value === option.value}
        onchange={() => onchange(option.value)}
      /><span>{option.label}</span></label
    >
  {/each}
</div>
