# Final fix report

Fixed: Important 1 (local sync side effects + seq-acked status, spec 3.5 amended), Important 2 (createAudioContext falls back to default rate, resume rejection caught), Important 3 (mixer tests).
Minors done: #1 (no per-render alloc), #3 processorerror warn, #5 resume catch, #8 transfer sound buffers in init, #9 private mirror fields, #10 (WebAudio message tests, null ctx test).
Minors skipped: #2 (vol/chan validation: callers trusted, C asserts only), #4 (context close / decode-before-connect: needs restructure of create, low value), #6 (addModule timeout: policy decision), #7 (corrupt-data-only validation difference).
Note: engine tests use "warm-up then compare to samples-disabled render" since raw OPL output is not exposed; identity is exact via floor((x+K*4096)/4096)=floor(x/4096)+K.
