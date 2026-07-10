(function (blocks, element, components, blockEditor, i18n, serverSideRender, hooks, compose) {
    const { registerBlockType } = blocks;
    const { createElement: el, Fragment, useEffect } = element;
    const { InspectorControls, InnerBlocks, MediaUpload, MediaUploadCheck, RichText, useBlockProps } = blockEditor;
    const { PanelBody, SelectControl, RangeControl, TextControl, ToggleControl, Button, Placeholder, Notice } = components;
    const { __ } = i18n;
    const addFilter = hooks && hooks.addFilter ? hooks.addFilter : null;
    const createHigherOrderComponent = compose && compose.createHigherOrderComponent ? compose.createHigherOrderComponent : null;

    const presets = window.GXScrollMotionEditor?.presets || {};
    const effects = window.GXScrollMotionEditor?.effects || [];
    const helpers = window.GXScrollMotionEditor?.helpers || [];
    const ServerSideRender = serverSideRender;
    const presetOptions = [{ label: __('None', 'gx-scroll-motion'), value: '' }].concat(Object.keys(presets).map((key) => ({ label: presets[key].label, value: key })));
    const helperOptions = [{ label: __('None', 'gx-scroll-motion'), value: '' }].concat(helpers.map((helper) => ({ label: helper.label, value: helper.class })));
    const engineOptions = [
        { label: __('Native', 'gx-scroll-motion'), value: 'native' },
        { label: __('GSAP', 'gx-scroll-motion'), value: 'gsap' },
    ];
    const helperText = helpers.map((helper) => `${helper.class}: ${helper.description}`).join('\n');
    const MOTION_TOKENS = [
        'sm-animate', 'sm-pin', 'sm-stagger-children', 'sm-story-stage', 'sm-snap-story',
        'sm-on-load',
        'sm-gb-hero-stack', 'sm-gb-card-grid', 'sm-gb-testimonial-strip', 'sm-preset-story-panels',
    ];
    const effectValues = effects.map((effect) => effect.value);

    const isEligibleBlock = (name) => {
        if (!name || name.indexOf('gx-scroll-motion/') === 0) return false;
        return true;
    };

    const tokenFromNumber = (prefix, value) => {
        if (value === undefined || value === null || value === '') return '';
        return `${prefix}${String(value).replace(/\./g, '_')}`;
    };

    const stripMotionClasses = (className) => {
        return String(className || '')
            .split(/\s+/)
            .filter(Boolean)
            .filter((token) => {
                if (MOTION_TOKENS.includes(token)) return false;
                if (token.indexOf('sm-preset-') === 0) return false;
                if (token.indexOf('sm-engine-') === 0) return false;
                if (token.indexOf('sm-start-') === 0) return false;
                if (token.indexOf('sm-end-') === 0) return false;
                if (token.indexOf('sm-distance-') === 0) return false;
                if (token.indexOf('sm-scale-from-') === 0) return false;
                if (token.indexOf('sm-rotate-from-') === 0) return false;
                if (token.indexOf('sm-blur-from-') === 0) return false;
                if (token.indexOf('sm-opacity-from-') === 0) return false;
                if (effectValues.includes(token.replace(/^sm-/, ''))) return false;
                return true;
            });
    };

    const buildMotionClasses = (attributes) => {
        if (!attributes.smEnabled) return '';
        return [
            'sm-animate',
            attributes.smPreset ? `sm-preset-${attributes.smPreset}` : '',
            attributes.smEffect ? `sm-${attributes.smEffect}` : '',
            attributes.smEngine ? `sm-engine-${attributes.smEngine}` : '',
            attributes.smHelper || '',
            attributes.smPin ? 'sm-pin' : '',
            attributes.smStaggerChildren ? 'sm-stagger-children' : '',
            attributes.smStory ? 'sm-story-stage' : '',
            attributes.smSnap ? 'sm-snap-story' : '',
            attributes.smOnLoad ? 'sm-on-load' : '',
            tokenFromNumber('sm-start-', attributes.smStart),
            tokenFromNumber('sm-end-', attributes.smEnd),
            tokenFromNumber('sm-distance-', attributes.smDistance),
        ].filter(Boolean).join(' ');
    };

    const syncMotionClassName = (attributes, setAttributes) => {
        const baseClasses = stripMotionClasses(attributes.className);
        const motionClasses = buildMotionClasses(attributes);
        const nextClassName = baseClasses.concat(motionClasses ? [motionClasses] : []).join(' ').trim();
        if ((attributes.className || '').trim() !== nextClassName) {
            setAttributes({ className: nextClassName });
        }
    };

    const applyPreset = (value, attributes, setAttributes) => {
        if (!value || !presets[value]) {
            setAttributes({ smPreset: value });
            return;
        }
        const preset = presets[value];
        const updates = {
            smEnabled: true,
            smPreset: value,
            smEffect: preset.effect || attributes.smEffect,
            smEngine: preset.engine || attributes.smEngine,
            smStart: preset.start ?? attributes.smStart,
            smEnd: preset.end ?? attributes.smEnd,
            smDistance: preset.distance ?? attributes.smDistance,
            smPin: preset.pin ?? attributes.smPin,
            smStaggerChildren: preset.staggerChildren ?? attributes.smStaggerChildren,
            smStory: preset.story ?? attributes.smStory,
            smSnap: preset.snap ?? attributes.smSnap,
        };
        if (preset.storyIntensity !== undefined) {
            updates.smStoryIntensity = preset.storyIntensity;
        }
        setAttributes(updates);
    };

    const applyAnimatedSectionPreset = (value, attributes, setAttributes) => {
        if (!value || !presets[value]) {
            setAttributes({ preset: value });
            return;
        }

        const preset = presets[value];
        const updates = {
            preset: value,
            effect: preset.effect || attributes.effect,
            engine: preset.engine || attributes.engine,
            start: preset.start ?? attributes.start,
            end: preset.end ?? attributes.end,
            distance: preset.distance ?? attributes.distance,
            scaleFrom: preset.scaleFrom ?? attributes.scaleFrom,
            rotateFrom: preset.rotateFrom ?? attributes.rotateFrom,
            blurFrom: preset.blurFrom ?? attributes.blurFrom,
            opacityFrom: preset.opacityFrom ?? attributes.opacityFrom,
            pin: preset.pin ?? attributes.pin,
            scrub: preset.scrub ?? attributes.scrub,
            staggerChildren: preset.staggerChildren ?? attributes.staggerChildren,
            staggerAmount: preset.staggerAmount ?? attributes.staggerAmount,
            childSelector: preset.childSelector || attributes.childSelector,
            story: false,
            snap: false,
            storyEnd: attributes.storyEnd,
            storyIntensity: attributes.storyIntensity,
        };

        setAttributes(updates);
    };

    if (addFilter) {
        addFilter('blocks.registerBlockType', 'gx-scroll-motion/attributes', (settings, name) => {
            if (!isEligibleBlock(name)) return settings;
            settings.attributes = Object.assign({}, settings.attributes || {}, {
                smEnabled: { type: 'boolean', default: false },
                smPreset: { type: 'string', default: '' },
                smEffect: { type: 'string', default: 'fade-up' },
                smEngine: { type: 'string', default: 'native' },
                smHelper: { type: 'string', default: '' },
                smStart: { type: 'number', default: 85 },
                smEnd: { type: 'number', default: 50 },
                smDistance: { type: 'number', default: 100 },
                smPin: { type: 'boolean', default: false },
                smStaggerChildren: { type: 'boolean', default: false },
                smStory: { type: 'boolean', default: false },
                smSnap: { type: 'boolean', default: false },
                smStoryIntensity: { type: 'number', default: 1.0 },
                smOnLoad: { type: 'boolean', default: false },
                smOnLoadDuration: { type: 'number', default: 900 },
                smOnLoadDelay: { type: 'number', default: 0 },
            });
            return settings;
        });
    }

    const withMotionControls = createHigherOrderComponent ? createHigherOrderComponent((BlockEdit) => {
        return (props) => {
            if (!isEligibleBlock(props.name)) {
                return el(BlockEdit, props);
            }

            const { attributes, setAttributes } = props;
            useEffect(() => {
                syncMotionClassName(attributes, setAttributes);
            }, [
                attributes.className,
                attributes.smEnabled,
                attributes.smPreset,
                attributes.smEffect,
                attributes.smEngine,
                attributes.smHelper,
                attributes.smStart,
                attributes.smEnd,
                attributes.smDistance,
                attributes.smPin,
                attributes.smStaggerChildren,
                attributes.smStory,
                attributes.smSnap,
                attributes.smOnLoad,
            ]);

            const previewClassName = buildMotionClasses(attributes) || __('Disabled', 'gx-scroll-motion');

            return el(Fragment, {},
                el(BlockEdit, props),
                el(InspectorControls, {},
                    el(PanelBody, { title: __('Scroll Motion', 'gx-scroll-motion'), initialOpen: false },
                        el(ToggleControl, {
                            label: __('Enable motion on this block', 'gx-scroll-motion'),
                            checked: !!attributes.smEnabled,
                            onChange: (value) => setAttributes({ smEnabled: value }),
                        }),
                        attributes.smEnabled && el(Fragment, {},
                            el(SelectControl, {
                                label: __('Preset', 'gx-scroll-motion'),
                                value: attributes.smPreset,
                                options: presetOptions,
                                onChange: (value) => applyPreset(value, attributes, setAttributes),
                                help: attributes.smPreset && presets[attributes.smPreset] ? presets[attributes.smPreset].description : __('Pick a preset or build your own mix below.', 'gx-scroll-motion'),
                            }),
                            el(SelectControl, {
                                label: __('GenerateBlocks helper', 'gx-scroll-motion'),
                                value: attributes.smHelper,
                                options: helperOptions,
                                onChange: (value) => setAttributes({ smHelper: value }),
                                help: __('Adds layout-friendly helper classes for common GB patterns.', 'gx-scroll-motion'),
                            }),
                            el(SelectControl, {
                                label: __('Effect', 'gx-scroll-motion'),
                                value: attributes.smEffect,
                                options: effects,
                                onChange: (value) => setAttributes({ smEffect: value }),
                            }),
                            el(SelectControl, {
                                label: __('Engine', 'gx-scroll-motion'),
                                value: attributes.smEngine,
                                options: engineOptions,
                                onChange: (value) => setAttributes({ smEngine: value }),
                            }),
                            el(RangeControl, {
                                label: __('Start %', 'gx-scroll-motion'),
                                value: attributes.smStart,
                                onChange: (value) => setAttributes({ smStart: value }),
                                min: 0,
                                max: 100,
                            }),
                            el(RangeControl, {
                                label: __('End %', 'gx-scroll-motion'),
                                value: attributes.smEnd,
                                onChange: (value) => setAttributes({ smEnd: value }),
                                min: 0,
                                max: 100,
                            }),
                            el(RangeControl, {
                                label: __('Distance', 'gx-scroll-motion'),
                                value: attributes.smDistance,
                                onChange: (value) => setAttributes({ smDistance: value }),
                                min: 0,
                                max: 300,
                            }),
                            el(ToggleControl, {
                                label: __('Pin section', 'gx-scroll-motion'),
                                checked: !!attributes.smPin,
                                onChange: (value) => setAttributes({ smPin: value }),
                            }),
                            el(ToggleControl, {
                                label: __('Stagger children', 'gx-scroll-motion'),
                                checked: !!attributes.smStaggerChildren,
                                onChange: (value) => setAttributes({ smStaggerChildren: value }),
                            }),
                            el(ToggleControl, {
                                label: __('On load animation', 'gx-scroll-motion'),
                                help: __('Play the effect once on page load — no scroll needed. Use for above-the-fold content.', 'gx-scroll-motion'),
                                checked: !!attributes.smOnLoad,
                                onChange: (value) => setAttributes({ smOnLoad: value }),
                            }),
                            attributes.smOnLoad && el(RangeControl, {
                                label: __('On load duration (ms)', 'gx-scroll-motion'),
                                value: attributes.smOnLoadDuration,
                                onChange: (value) => setAttributes({ smOnLoadDuration: value }),
                                min: 100,
                                max: 3000,
                                step: 50,
                            }),
                            attributes.smOnLoad && el(RangeControl, {
                                label: __('On load delay (ms)', 'gx-scroll-motion'),
                                value: attributes.smOnLoadDelay,
                                onChange: (value) => setAttributes({ smOnLoadDelay: value }),
                                min: 0,
                                max: 3000,
                                step: 50,
                            }),
                            el(Notice, { status: 'info', isDismissible: false }, helperText),
                            el('div', { className: 'sm-motion-panel__preview' }, previewClassName)
                        )
                    )
                )
            );
        };
    }, 'withMotionControls') : null;

    if (addFilter && withMotionControls) {
        addFilter('editor.BlockEdit', 'gx-scroll-motion/with-controls', withMotionControls);
    }

    registerBlockType('gx-scroll-motion/animated-section', {
        apiVersion: 2,
        title: __('Animated Section', 'gx-scroll-motion'),
        icon: 'format-image',
        category: 'design',
        description: __('Scroll-reactive wrapper block with presets and staggered child motion.', 'gx-scroll-motion'),
        attributes: {
            effect: { type: 'string', default: 'fade-up' },
            preset: { type: 'string', default: '' },
            engine: { type: 'string', default: 'native' },
            start: { type: 'number', default: 85 },
            end: { type: 'number', default: 50 },
            distance: { type: 'number', default: 100 },
            scaleFrom: { type: 'number', default: 0.85 },
            rotateFrom: { type: 'number', default: 16 },
            blurFrom: { type: 'number', default: 10 },
            opacityFrom: { type: 'number', default: 0 },
            extraClass: { type: 'string', default: '' },
            anchor: { type: 'string', default: '' },
            pin: { type: 'boolean', default: false },
            scrub: { type: 'boolean', default: true },
            staggerChildren: { type: 'boolean', default: false },
            staggerAmount: { type: 'number', default: 0.12 },
            childSelector: { type: 'string', default: '[data-sm-child], .sm-child, .gb-grid-column, .gb-headline, .gb-button-wrapper' },
            story: { type: 'boolean', default: false },
            snap: { type: 'boolean', default: false },
            storyEnd: { type: 'number', default: 400 },
            storyIntensity: { type: 'number', default: 1.0 },
            onLoad: { type: 'boolean', default: false },
            onLoadDuration: { type: 'number', default: 900 },
            onLoadDelay: { type: 'number', default: 0 },
        },
        edit: function (props) {
            const { attributes, setAttributes } = props;
            const blockProps = useBlockProps({ className: 'sm-editor-block sm-editor-animated-section' });
            const summary = `${String(attributes.engine || 'native').toUpperCase()} / ${attributes.effect || 'fade-up'}${attributes.preset ? ` / ${presets[attributes.preset]?.label || attributes.preset}` : ''}${attributes.staggerChildren ? ' / STAGGER' : ''}`;

            return el(Fragment, {},
                el(InspectorControls, {},
                    el(PanelBody, { title: __('Animation Preset', 'gx-scroll-motion'), initialOpen: true },
                        el(SelectControl, {
                            label: __('Preset', 'gx-scroll-motion'),
                            value: attributes.preset,
                            options: presetOptions,
                            onChange: (value) => {
                                applyAnimatedSectionPreset(value, attributes, setAttributes);
                            },
                            help: attributes.preset && presets[attributes.preset] ? presets[attributes.preset].description : '',
                        }),
                        el(SelectControl, {
                            label: __('Engine', 'gx-scroll-motion'),
                            value: attributes.engine,
                            options: engineOptions,
                            onChange: (value) => setAttributes({ engine: value }),
                        }),
                        el(SelectControl, {
                            label: __('Effect', 'gx-scroll-motion'),
                            value: attributes.effect,
                            options: effects,
                            onChange: (value) => setAttributes({ effect: value }),
                        }),
                        el(ToggleControl, {
                            label: __('Scrub with scroll', 'gx-scroll-motion'),
                            checked: !!attributes.scrub,
                            onChange: (value) => setAttributes({ scrub: value }),
                        }),
                        el(ToggleControl, {
                            label: __('Pin section', 'gx-scroll-motion'),
                            checked: !!attributes.pin,
                            onChange: (value) => setAttributes({ pin: value }),
                        }),
                        el(ToggleControl, {
                            label: __('On load animation', 'gx-scroll-motion'),
                            help: __('Play the effect once on page load — no scroll needed. Use for above-the-fold content.', 'gx-scroll-motion'),
                            checked: !!attributes.onLoad,
                            onChange: (value) => setAttributes({ onLoad: value }),
                        }),
                        attributes.onLoad && el(RangeControl, {
                            label: __('On load duration (ms)', 'gx-scroll-motion'),
                            value: attributes.onLoadDuration,
                            onChange: (value) => setAttributes({ onLoadDuration: value }),
                            min: 100,
                            max: 3000,
                            step: 50,
                        }),
                        attributes.onLoad && el(RangeControl, {
                            label: __('On load delay (ms)', 'gx-scroll-motion'),
                            value: attributes.onLoadDelay,
                            onChange: (value) => setAttributes({ onLoadDelay: value }),
                            min: 0,
                            max: 3000,
                            step: 50,
                        })
                    ),
                    el(PanelBody, { title: __('Stagger', 'gx-scroll-motion'), initialOpen: false },
                        el(ToggleControl, {
                            label: __('Stagger child elements', 'gx-scroll-motion'),
                            checked: !!attributes.staggerChildren,
                            onChange: (value) => setAttributes({ staggerChildren: value }),
                        }),
                        el(RangeControl, {
                            label: __('Stagger amount', 'gx-scroll-motion'),
                            value: attributes.staggerAmount,
                            onChange: (value) => setAttributes({ staggerAmount: value }),
                            min: 0,
                            max: 0.6,
                            step: 0.01,
                        }),
                        el(TextControl, {
                            label: __('Child selector', 'gx-scroll-motion'),
                            value: attributes.childSelector,
                            onChange: (value) => setAttributes({ childSelector: value }),
                            help: __('Default works well for GenerateBlocks grids/headlines/buttons.', 'gx-scroll-motion'),
                        })
                    ),
                    el(PanelBody, { title: __('Motion Tuning', 'gx-scroll-motion'), initialOpen: false },
                        el(RangeControl, { label: __('Start %', 'gx-scroll-motion'), value: attributes.start, onChange: (value) => setAttributes({ start: value }), min: 0, max: 100 }),
                        el(RangeControl, { label: __('End %', 'gx-scroll-motion'), value: attributes.end, onChange: (value) => setAttributes({ end: value }), min: 0, max: 100 }),
                        el(RangeControl, { label: __('Distance', 'gx-scroll-motion'), value: attributes.distance, onChange: (value) => setAttributes({ distance: value }), min: 0, max: 300 }),
                        el(RangeControl, { label: __('Scale From', 'gx-scroll-motion'), value: attributes.scaleFrom, onChange: (value) => setAttributes({ scaleFrom: value }), min: 0.4, max: 1.6, step: 0.01 }),
                        el(RangeControl, { label: __('Rotate From', 'gx-scroll-motion'), value: attributes.rotateFrom, onChange: (value) => setAttributes({ rotateFrom: value }), min: 0, max: 45 }),
                        el(RangeControl, { label: __('Blur From', 'gx-scroll-motion'), value: attributes.blurFrom, onChange: (value) => setAttributes({ blurFrom: value }), min: 0, max: 30 }),
                        el(RangeControl, { label: __('Opacity From', 'gx-scroll-motion'), value: attributes.opacityFrom, onChange: (value) => setAttributes({ opacityFrom: value }), min: 0, max: 1, step: 0.05 })
                    ),
                    el(PanelBody, { title: __('GenerateBlocks Helpers', 'gx-scroll-motion'), initialOpen: false },
                        el(Notice, { status: 'info', isDismissible: false }, helperText),
                        el(TextControl, {
                            label: __('Extra CSS classes', 'gx-scroll-motion'),
                            value: attributes.extraClass,
                            onChange: (value) => setAttributes({ extraClass: value }),
                            help: __('Example: sm-gb-hero-stack or sm-gb-card-grid', 'gx-scroll-motion'),
                        }),
                        el(TextControl, {
                            label: __('Anchor / ID', 'gx-scroll-motion'),
                            value: attributes.anchor,
                            onChange: (value) => setAttributes({ anchor: value }),
                        })
                    )
                ),
                el('div', blockProps,
                    el('div', { className: 'sm-editor-block__meta' }, summary),
                    el('div', { className: 'sm-editor-block__hint' }, __('Add animated content. Use stagger for repeated child elements.', 'gx-scroll-motion')),
                    el(InnerBlocks, { template: [['core/paragraph', { placeholder: __('Add animated content…', 'gx-scroll-motion') }]] })
                )
            );
        },
        save: function () {
            return el(InnerBlocks.Content);
        },
    });

    registerBlockType('gx-scroll-motion/scroll-video', {
        apiVersion: 2,
        title: __('Scroll Video', 'gx-scroll-motion'),
        icon: 'video-alt3',
        category: 'media',
        description: __('Scroll-scrub video block with optional fullscreen sticky section mode.', 'gx-scroll-motion'),
        attributes: {
            src: { type: 'string', default: '' },
            poster: { type: 'string', default: '' },
            className: { type: 'string', default: '' },
            pixelsPerSecond: { type: 'number', default: 700 },
            loop: { type: 'boolean', default: false },
            preload: { type: 'string', default: 'metadata' },
            caption: { type: 'string', default: '' },
            sectionMode: { type: 'boolean', default: true },
            sectionHeightVh: { type: 'number', default: 220 },
            stageHeightVh: { type: 'number', default: 100 },
        },
        edit: function (props) {
            const { attributes, setAttributes } = props;
            const blockProps = useBlockProps({ className: 'sm-editor-block sm-editor-scroll-video' });

            return el(Fragment, {},
                el(InspectorControls, {},
                    el(PanelBody, { title: __('Media', 'gx-scroll-motion'), initialOpen: true },
                        el(MediaUploadCheck, {},
                            el(MediaUpload, {
                                onSelect: (media) => setAttributes({ src: media?.url || '' }),
                                allowedTypes: ['video'],
                                render: ({ open }) => el(Button, { variant: 'primary', onClick: open }, attributes.src ? __('Replace video', 'gx-scroll-motion') : __('Select video', 'gx-scroll-motion')),
                            })
                        ),
                        el(TextControl, { label: __('Video URL', 'gx-scroll-motion'), value: attributes.src, onChange: (value) => setAttributes({ src: value }) }),
                        el(TextControl, { label: __('Poster URL', 'gx-scroll-motion'), value: attributes.poster, onChange: (value) => setAttributes({ poster: value }) }),
                    ),
                    el(PanelBody, { title: __('Behavior', 'gx-scroll-motion'), initialOpen: false },
                        el(ToggleControl, {
                            label: __('Fullscreen scroll section', 'gx-scroll-motion'),
                            checked: !!attributes.sectionMode,
                            onChange: (value) => setAttributes({ sectionMode: value }),
                            help: __('Pins a full-screen video stage while you travel through the section height.', 'gx-scroll-motion'),
                        }),
                        attributes.sectionMode && el(Fragment, {},
                            el(RangeControl, {
                                label: __('Section travel height (vh)', 'gx-scroll-motion'),
                                value: attributes.sectionHeightVh,
                                onChange: (value) => setAttributes({ sectionHeightVh: value }),
                                min: 100,
                                max: 600,
                                step: 10,
                                help: __('How much scroll distance this section occupies. The video scrubs and can loop while you move through it.', 'gx-scroll-motion'),
                            }),
                            el(RangeControl, {
                                label: __('Stage height (vh)', 'gx-scroll-motion'),
                                value: attributes.stageHeightVh,
                                onChange: (value) => setAttributes({ stageHeightVh: value }),
                                min: 40,
                                max: 100,
                                step: 5,
                                help: __('Visible video height while the section is pinned. Use 100 for full screen.', 'gx-scroll-motion'),
                            })
                        ),
                        el(RangeControl, { label: __('Pixels per second', 'gx-scroll-motion'), value: attributes.pixelsPerSecond, onChange: (value) => setAttributes({ pixelsPerSecond: value }), min: 100, max: 2000, step: 10, help: __('Lower = faster looping for a given travel distance. Higher = slower scrub.', 'gx-scroll-motion') }),
                        el(SelectControl, {
                            label: __('Preload', 'gx-scroll-motion'),
                            value: attributes.preload,
                            options: [
                                { label: __('Metadata', 'gx-scroll-motion'), value: 'metadata' },
                                { label: __('Auto', 'gx-scroll-motion'), value: 'auto' },
                                { label: __('None', 'gx-scroll-motion'), value: 'none' },
                            ],
                            onChange: (value) => setAttributes({ preload: value }),
                        }),
                        el(ToggleControl, { label: __('Loop while scrubbing', 'gx-scroll-motion'), checked: !!attributes.loop, onChange: (value) => setAttributes({ loop: value }), help: __('When on, the video wraps and repeats as you move down or back up the section.' ,'gx-scroll-motion') }),
                        el(TextControl, { label: __('Extra CSS classes', 'gx-scroll-motion'), value: attributes.className, onChange: (value) => setAttributes({ className: value }) })
                    )
                ),
                el('div', blockProps,
                    attributes.src
                        ? el(Fragment, {},
                            el(ServerSideRender, { block: 'gx-scroll-motion/scroll-video', attributes }),
                            el(RichText, { tagName: 'p', className: 'sm-editor-caption-field', placeholder: __('Optional caption…', 'gx-scroll-motion'), value: attributes.caption, onChange: (value) => setAttributes({ caption: value }) })
                        )
                        : el(Placeholder, { icon: 'video-alt3', label: __('Scroll Video', 'gx-scroll-motion'), instructions: __('Choose a video or paste a direct MP4/WebM URL.', 'gx-scroll-motion') },
                            el(MediaUploadCheck, {},
                                el(MediaUpload, {
                                    onSelect: (media) => setAttributes({ src: media?.url || '' }),
                                    allowedTypes: ['video'],
                                    render: ({ open }) => el(Button, { variant: 'primary', onClick: open }, __('Select video', 'gx-scroll-motion')),
                                })
                            )
                        )
                )
            );
        },
        save: function () {
            return null;
        },
    });
})(window.wp.blocks, window.wp.element, window.wp.components, window.wp.blockEditor, window.wp.i18n, window.wp.serverSideRender, window.wp.hooks, window.wp.compose);
