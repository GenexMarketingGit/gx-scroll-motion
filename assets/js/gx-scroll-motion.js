(() => {
    const config = window.GXScrollMotionConfig || {};
    const presetMap = config.presets || {};
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const knownEffects = [
        'fade-up', 'fade-down', 'fade-left', 'fade-right', 'scale-in', 'scale-out',
        'rotate-in', 'blur-in', 'parallax', 'clip-reveal', 'stack-cards', 'scrub-zoom',
        'scramble', 'type-in'
    ];
    const textEffects = ['scramble', 'type-in'];
    const scrambleGlyphs = '▓▒░<>!@#$%&*+=?/~^アイウエオカサタナXYZ0123456789';

    let animationElements = [];
    let videoElements = [];
    let ticking = false;
    let initialized = false;
    let rafId = null;
    const SCROLL_TRIGGER_ID = 'gx-scroll-motion';
    let lastScrollY = window.scrollY || window.pageYOffset || 0;

    const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
    const parseNumber = (value, fallback) => {
        const numeric = parseFloat(value);
        return Number.isFinite(numeric) ? numeric : fallback;
    };

    const smoothstep = (value) => value * value * (3 - 2 * value);

    const getClassTokenNumber = (element, prefix, fallback, divideBy = 1) => {
        const token = Array.from(element.classList || []).find((entry) => entry.startsWith(prefix));
        if (!token) return fallback;
        const numeric = parseFloat(token.slice(prefix.length).replace(/_/g, '.'));
        return Number.isFinite(numeric) ? numeric / divideBy : fallback;
    };

    const getPresetName = (element) => {
        if (element.dataset.smPreset) return element.dataset.smPreset;
        const token = Array.from(element.classList || []).find((entry) => entry.startsWith('sm-preset-'));
        return token ? token.replace('sm-preset-', '') : '';
    };

    const getEffect = (element, preset) => {
        if (element.dataset.smEffect) return element.dataset.smEffect;
        const classList = Array.from(element.classList || []);
        for (const token of classList) {
            const clean = token.replace(/^sm-/, '');
            if (knownEffects.includes(clean)) return clean;
        }
        return (preset && preset.effect) || 'fade-up';
    };

    const getEngine = (element, preset) => {
        if (element.dataset.smEngine) return element.dataset.smEngine;
        const token = Array.from(element.classList || []).find((entry) => entry.startsWith('sm-engine-'));
        if (token) return token.replace('sm-engine-', '');
        return (preset && preset.engine) || 'native';
    };

    const getChildren = (element, selector, story = false) => {
        if (!element) return [];
        const finalSelector = story ? '.sm-story-panel' : (selector || '[data-sm-child], .sm-child');
        const selected = Array.from(element.querySelectorAll(finalSelector));
        if (selected.length) return selected;
        return Array.from(element.children || []);
    };

    const getElementSettings = (element) => {
        const preset = presetMap[getPresetName(element)] || null;
        return {
            element,
            preset,
            effect: getEffect(element, preset),
            engine: getEngine(element, preset),
            start: parseNumber(element.dataset.smStart, preset?.start ?? getClassTokenNumber(element, 'sm-start-', 85)),
            end: parseNumber(element.dataset.smEnd, preset?.end ?? getClassTokenNumber(element, 'sm-end-', 15)),
            distance: parseNumber(element.dataset.smDistance, preset?.distance ?? getClassTokenNumber(element, 'sm-distance-', 100)),
            scaleFrom: parseNumber(element.dataset.smScaleFrom, preset?.scaleFrom ?? getClassTokenNumber(element, 'sm-scale-from-', 0.85, 100)),
            rotateFrom: parseNumber(element.dataset.smRotateFrom, preset?.rotateFrom ?? getClassTokenNumber(element, 'sm-rotate-from-', 16)),
            blurFrom: parseNumber(element.dataset.smBlurFrom, preset?.blurFrom ?? getClassTokenNumber(element, 'sm-blur-from-', 10)),
            opacityFrom: parseNumber(element.dataset.smOpacityFrom, preset?.opacityFrom ?? getClassTokenNumber(element, 'sm-opacity-from-', 0, 100)),
            pin: element.dataset.smPin === '1' || element.classList.contains('sm-pin'),
            scrub: element.dataset.smScrub !== '0',
            staggerChildren: element.dataset.smStagger === '1' || !!preset?.staggerChildren || element.classList.contains('sm-stagger-children'),
            staggerAmount: parseNumber(element.dataset.smStaggerAmount, preset?.staggerAmount ?? 0.12),
            childSelector: element.dataset.smChildSelector || preset?.childSelector || '[data-sm-child], .sm-child, .gb-grid-column, .gb-headline, .gb-button-wrapper',
            story: element.dataset.smStory === '1' || !!preset?.story || element.classList.contains('sm-story-stage'),
            snap: element.dataset.smSnap === '1' || !!preset?.snap || element.classList.contains('sm-snap-story'),
            storyEnd: parseNumber(element.dataset.smStoryEnd, preset?.storyEnd ?? 400),
            storyIntensity: parseNumber(element.dataset.smStoryIntensity, preset?.storyIntensity ?? 1.0),
            onLoad: element.dataset.smOnLoad === '1' || element.classList.contains('sm-on-load'),
            onLoadDuration: parseNumber(element.dataset.smOnLoadDuration, 900),
            onLoadDelay: parseNumber(element.dataset.smOnLoadDelay, 0),
        };
    };

    const setStyles = (element, styles) => {
        if (!element || !element.style) return;
        Object.entries(styles).forEach(([key, value]) => {
            element.style[key] = value;
        });
    };

    const hashString = (value) => {
        let hash = 0;
        const input = String(value || '');
        for (let index = 0; index < input.length; index += 1) {
            hash = ((hash << 5) - hash) + input.charCodeAt(index);
            hash |= 0;
        }
        return Math.abs(hash);
    };

    const debugLog = (element, ...args) => {
        if (element && element.dataset && element.dataset.smDebug === '1') {
            console.log(...args);
        }
    };

    const getTextTargets = (element) => {
        if (!element) return [];
        const selector = element.dataset.smTextSelector || '[data-sm-text], .sm-text, h1, h2, h3, h4, h5, h6, p, li, blockquote, figcaption, .gb-headline-text, .gb-text';
        const candidates = Array.from(element.querySelectorAll(selector)).filter((node) => node.textContent && node.textContent.trim());
        const leaves = candidates.filter((node) => !Array.from(node.children || []).some((child) => child.textContent && child.textContent.trim()));
        if (leaves.length) return leaves;
        if (candidates.length) return candidates;
        return element.textContent && element.textContent.trim() ? [element] : [];
    };

    const ensureTextEffectState = (entry) => {
        if (entry.textTargets) return entry.textTargets;
        entry.textTargets = getTextTargets(entry.element).map((node, index) => ({
            node,
            original: node.textContent || '',
            seed: hashString(`${node.textContent || ''}-${index}`),
        }));
        entry.textTargets.forEach(({ node, original }) => {
            node.dataset.smOriginalText = original;
        });
        return entry.textTargets;
    };

    const randomGlyph = (seed, offset) => {
        const index = Math.abs((seed + (offset * 17)) % scrambleGlyphs.length);
        return scrambleGlyphs.charAt(index);
    };

    const renderScrambleText = (source, visibleCount, tickSeed) => {
        const chars = Array.from(source);
        return chars.map((char, index) => {
            if (/\s/.test(char)) return char;
            if (index < visibleCount) return char;
            return randomGlyph(tickSeed, index);
        }).join('');
    };

    const applyTextEffect = (entry, progress) => {
        const targets = ensureTextEffectState(entry);
        const tickSeed = Math.floor((window.performance?.now?.() || Date.now()) / 48);
        targets.forEach(({ node, original, seed }) => {
            const glyphs = Array.from(original);
            const visibleCount = Math.floor(glyphs.length * progress);
            if (entry.settings.effect === 'type-in') {
                const nextText = glyphs.slice(0, visibleCount).join('') + (progress > 0 && progress < 1 ? '▌' : '');
                node.textContent = nextText;
                return;
            }
            node.textContent = progress >= 1 ? original : renderScrambleText(original, visibleCount, seed + tickSeed);
        });
    };

    const restoreTextEffect = (element) => {
        getTextTargets(element).forEach((node) => {
            if (node.dataset.smOriginalText !== undefined) {
                node.textContent = node.dataset.smOriginalText;
            }
        });
    };

    const resetElement = (element) => {
        if (!element) return;
        setStyles(element, {
            opacity: '', transform: '', filter: '', clipPath: '', willChange: '', position: '', top: ''
        });
        restoreTextEffect(element);
        Array.from(element.querySelectorAll('[data-sm-child], .sm-child, .sm-story-panel, .gb-grid-column, .gb-headline, .gb-button-wrapper')).forEach((child) => {
            setStyles(child, { opacity: '', transform: '', filter: '', clipPath: '', willChange: '', gridArea: '', zIndex: '' });
        });
        // Reset story stage inline styles on .sm-block-content
        const storyStage = element.querySelector('.sm-block-content');
        if (storyStage) {
            setStyles(storyStage, { display: '', alignItems: '', justifyItems: '' });
        }
    };

    const isScrolledToBottom = () => {
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        const docHeight = document.documentElement.scrollHeight || 0;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        return (scrollY + viewportHeight) >= (docHeight - 2);
    };

    const computeProgress = (element, settings) => {
        if (!element || typeof element.getBoundingClientRect !== 'function') return 0;
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const startPx = viewportHeight * (settings.start / 100);
        const endPx = viewportHeight * (settings.end / 100);
        const range = (startPx - endPx) || 1;
        let progress = clamp((startPx - rect.top) / range, 0, 1);
        if (progress < 1 && isScrolledToBottom() && rect.bottom > 0 && rect.top < viewportHeight) {
            progress = 1;
        }
        return progress;
    };

    const styleForProgress = (settings, progress) => {
        const eased = smoothstep(progress);
        const opacity = settings.opacityFrom + ((1 - settings.opacityFrom) * eased);
        let transform = '';
        let filter = 'none';
        let clipPath = 'inset(0 0 0 0)';

        switch (settings.effect) {
            case 'fade-down':
                transform = `translate3d(0, ${(1 - eased) * -settings.distance}px, 0)`;
                break;
            case 'fade-left':
                transform = `translate3d(${(1 - eased) * settings.distance}px, 0, 0)`;
                break;
            case 'fade-right':
                transform = `translate3d(${(1 - eased) * -settings.distance}px, 0, 0)`;
                break;
            case 'scale-in':
                transform = `scale(${settings.scaleFrom + ((1 - settings.scaleFrom) * eased)})`;
                break;
            case 'scale-out':
                transform = `scale(${1 + ((1 - eased) * Math.max(0, 1 - settings.scaleFrom))})`;
                break;
            case 'rotate-in':
                transform = `translate3d(0, ${(1 - eased) * settings.distance * 0.35}px, 0) rotate(${(1 - eased) * settings.rotateFrom}deg)`;
                break;
            case 'blur-in':
                transform = `translate3d(0, ${(1 - eased) * settings.distance * 0.35}px, 0)`;
                filter = `blur(${(1 - eased) * settings.blurFrom}px)`;
                break;
            case 'parallax':
                transform = `translate3d(0, ${(0.5 - eased) * settings.distance}px, 0)`;
                break;
            case 'clip-reveal':
                transform = `translate3d(0, ${(1 - eased) * settings.distance * 0.2}px, 0)`;
                clipPath = `inset(${(1 - eased) * 100}% 0 0 0 round 0px)`;
                break;
            case 'scrub-zoom':
                transform = `scale(${settings.scaleFrom - ((settings.scaleFrom - 1) * eased)})`;
                break;
            case 'stack-cards':
                transform = `translate3d(0, ${(1 - eased) * settings.distance}px, 0) scale(${settings.scaleFrom + ((1 - settings.scaleFrom) * eased)})`;
                break;
            case 'fade-up':
            default:
                transform = `translate3d(0, ${(1 - eased) * settings.distance}px, 0)`;
                break;
        }

        return {
            opacity: String(clamp(opacity, 0, 1)),
            transform,
            filter,
            clipPath,
            willChange: 'transform, opacity, filter, clip-path'
        };
    };

    const applyNativeAtProgress = (entry, progress) => {
        const { element, settings } = entry;
        const baseStyles = textEffects.includes(settings.effect)
            ? { opacity: String(clamp(progress, 0, 1)), transform: 'none', filter: 'none', clipPath: 'inset(0 0 0 0)', willChange: 'opacity, contents' }
            : styleForProgress(settings, progress);
        setStyles(element, baseStyles);

        if (textEffects.includes(settings.effect)) {
            applyTextEffect(entry, progress);
            return;
        }

        if (settings.staggerChildren || settings.story) {
            const children = getChildren(element, settings.childSelector, settings.story);
            const count = Math.max(children.length, 1);
            children.forEach((child, index) => {
                const local = clamp((progress - (index * settings.staggerAmount)) / Math.max(0.2, 1 - ((count - 1) * settings.staggerAmount)), 0, 1);
                const childSettings = { ...settings, distance: settings.story ? settings.distance * 0.75 : settings.distance * 0.55 };
                setStyles(child, styleForProgress(childSettings, local));
            });
        }
    };

    const applyNativeAnimation = (entry) => {
        const progress = computeProgress(entry.element, entry.settings);
        applyNativeAtProgress(entry, progress);
    };

    const playOnLoadNative = (entry) => {
        if (entry.onLoadDone || entry.onLoadStarted) return;
        entry.onLoadStarted = true;
        if (prefersReducedMotion.matches) {
            applyNativeAtProgress(entry, 1);
            entry.onLoadDone = true;
            return;
        }
        const duration = Math.max(50, entry.settings.onLoadDuration || 900);
        const delay = Math.max(0, entry.settings.onLoadDelay || 0);
        applyNativeAtProgress(entry, 0);
        const startAt = (window.performance?.now?.() || Date.now()) + delay;
        const tick = (now) => {
            const elapsed = now - startAt;
            if (elapsed < 0) {
                window.requestAnimationFrame(tick);
                return;
            }
            const t = clamp(elapsed / duration, 0, 1);
            applyNativeAtProgress(entry, t);
            if (t < 1) {
                window.requestAnimationFrame(tick);
            } else {
                entry.onLoadDone = true;
            }
        };
        window.requestAnimationFrame(tick);
    };

    const clearGSAP = (element) => {
        if (!element) return;
        if (window.gsap) {
            window.gsap.killTweensOf(element);
            getChildren(element, '[data-sm-child], .sm-child, .sm-story-panel, .gb-grid-column, .gb-headline, .gb-button-wrapper').forEach((child) => window.gsap.killTweensOf(child));
        }
        if (window.ScrollTrigger) {
            window.ScrollTrigger.getAll().forEach((trigger) => {
                if (trigger.trigger === element && trigger.vars && trigger.vars.id === SCROLL_TRIGGER_ID) {
                    trigger.kill();
                }
            });
        }
    };

    const buildGSAPVars = (settings) => {
        const fromVars = { opacity: settings.opacityFrom };
        const toVars = { opacity: 1, ease: 'none' };
        switch (settings.effect) {
            case 'fade-down':
                fromVars.y = -settings.distance; toVars.y = 0; break;
            case 'fade-left':
                fromVars.x = settings.distance; toVars.x = 0; break;
            case 'fade-right':
                fromVars.x = -settings.distance; toVars.x = 0; break;
            case 'scale-in':
                fromVars.scale = settings.scaleFrom; toVars.scale = 1; break;
            case 'scale-out':
            case 'scrub-zoom':
                fromVars.scale = settings.scaleFrom > 1 ? settings.scaleFrom : 1.15; toVars.scale = 1; break;
            case 'rotate-in':
                fromVars.rotation = settings.rotateFrom; fromVars.y = settings.distance * 0.35; toVars.rotation = 0; toVars.y = 0; break;
            case 'blur-in':
                fromVars.filter = `blur(${settings.blurFrom}px)`; fromVars.y = settings.distance * 0.35; toVars.filter = 'blur(0px)'; toVars.y = 0; break;
            case 'parallax':
                fromVars.y = settings.distance * -0.4; toVars.y = settings.distance * 0.4; break;
            case 'clip-reveal':
                fromVars.clipPath = 'inset(100% 0 0 0)'; toVars.clipPath = 'inset(0% 0 0 0)'; break;
            case 'stack-cards':
                fromVars.y = settings.distance; fromVars.scale = settings.scaleFrom; toVars.y = 0; toVars.scale = 1; break;
            case 'fade-up':
            default:
                fromVars.y = settings.distance; toVars.y = 0; break;
        }
        return { fromVars, toVars };
    };

    // ─── Story Mode: effect → story-axis mapping ────────────────────
    const getStoryAxis = (effect, enterDistance, exitDistance) => {
        switch (effect) {
            case 'fade-left':
                return { enterX: enterDistance, exitX: exitDistance, enterY: 0, exitY: 0, scaleIn: false, blurIn: false };
            case 'fade-right':
                return { enterX: -enterDistance, exitX: -exitDistance, enterY: 0, exitY: 0, scaleIn: false, blurIn: false };
            case 'fade-down':
                return { enterX: 0, exitX: 0, enterY: -enterDistance, exitY: -exitDistance, scaleIn: false, blurIn: false };
            case 'scale-in':
                return { enterX: 0, exitX: 0, enterY: 0, exitY: 0, scaleIn: true, blurIn: false };
            case 'blur-in':
                return { enterX: 0, exitX: 0, enterY: enterDistance * 0.45, exitY: exitDistance * 0.45, scaleIn: false, blurIn: true };
            case 'fade-up':
            default:
                return { enterX: 0, exitX: 0, enterY: enterDistance, exitY: exitDistance, scaleIn: false, blurIn: false };
        }
    };

    // ─── Story Mode: setStoryState (per-panel visual state from progress) ──
    const setStoryState = (element, panels, progress, settings, debugMeta) => {
        const count = panels.length;
        if (count === 0) return;

        const gsap = window.gsap;
        const intensity = settings.storyIntensity || 1.0;
        const baseScale = settings.scaleFrom < 1 ? Math.max(settings.scaleFrom, 0.985) : 0.985;
        const focus = count === 1 ? 0 : progress * (count - 1);
        const enterDistance = settings.distance * 0.14 * intensity;
        const exitDistance = settings.distance * -0.06 * intensity;
        const influenceWidth = 1.35;
        const debugStates = [];

        panels.forEach((panel, index) => {
            const panelEffect = panel._smPanelEffect && knownEffects.includes(panel._smPanelEffect)
                ? panel._smPanelEffect
                : settings.effect;
            const axis = getStoryAxis(panelEffect, enterDistance, exitDistance);
            const signedOffset = index - focus;
            const absOffset = Math.abs(signedOffset);
            const influence = smoothstep(clamp(1 - (absOffset / influenceWidth), 0, 1));
            const softness = smoothstep(clamp(1 - (absOffset / (influenceWidth * 0.82)), 0, 1));
            const enterProgress = signedOffset > 0 ? (1 - softness) * clamp(absOffset, 0, 1.1) : 0;
            const exitProgress = signedOffset < 0 ? (1 - softness) * clamp(absOffset, 0, 1.1) : 0;

            let opacity = influence;
            let x = axis.enterX * enterProgress + axis.exitX * exitProgress;
            let y = axis.enterY * enterProgress + axis.exitY * exitProgress;
            let scale = 1;
            let blur = 0;

            if (axis.scaleIn) {
                scale = baseScale + ((1 - baseScale) * influence);
                scale += exitProgress * 0.008 * intensity;
            } else {
                scale = 1 - ((1 - baseScale) * (1 - influence) * 0.35);
                scale += exitProgress * 0.004 * intensity;
            }

            if (axis.blurIn) {
                blur = 6 * intensity * enterProgress;
            }

            if (index === 0 && progress <= 0.001) {
                opacity = 1;
                x = 0;
                y = 0;
                scale = 1;
                blur = 0;
            }

            if (index === count - 1 && progress >= 0.999) {
                opacity = 1;
                x = 0;
                y = 0;
                scale = 1;
                blur = 0;
            }

            const zIndex = index + 1;

            if (gsap) {
                gsap.set(panel, {
                    autoAlpha: opacity,
                    x,
                    y,
                    scale,
                    zIndex,
                    force3D: true,
                    filter: blur > 0.1 ? `blur(${blur}px)` : 'none',
                });
            } else {
                panel.style.opacity = String(opacity);
                panel.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${scale})`;
                panel.style.filter = blur > 0.1 ? `blur(${blur}px)` : '';
                panel.style.zIndex = String(zIndex);
            }

            debugStates.push({
                index,
                effect: panelEffect,
                opacity: Number(opacity.toFixed(3)),
                x: Number(x.toFixed(1)),
                y: Number(y.toFixed(1)),
                scale: Number(scale.toFixed(4)),
                blur: Number(blur.toFixed(1)),
            });
        });

        if (debugMeta) {
            const activePanel = debugStates.reduce((best, panel) => panel.opacity > best.opacity ? panel : best, debugStates[0] || { index: 0, opacity: 0 });
            debugLog(element, 'GX Scroll Motion: Story state', {
                progress: Number(progress.toFixed(4)),
                focus: Number(focus.toFixed(4)),
                activeIndex: activePanel.index || 0,
                panels: debugStates,
                ...debugMeta,
            });
        }
    };

    // ─── Story Mode: GSAP setup ─────────────────────────────────────
    const applyGSAPStory = (entry) => {
        const { element, settings } = entry;
        const gsap = window.gsap;
        const ScrollTrigger = window.ScrollTrigger;
        const debugStory = element.dataset.smDebug === '1' || window.GXScrollMotionDebugStory === true;
        if (!gsap || !ScrollTrigger) return false;

        // Find the real story stage (.sm-block-content or element itself)
        const storyStage = element.querySelector('.sm-block-content') || element;
        const panels = Array.from(storyStage.querySelectorAll('.sm-story-panel'));
        if (panels.length === 0) {
            console.warn('GX Scroll Motion: Story mode enabled but no .sm-story-panel children found');
            return false;
        }

        // Force parent wrapper visible (prevent .sm-motion-ready hidden state from blanking stage)
        gsap.set(element, { autoAlpha: 1, y: 0, x: 0, clearProps: 'filter,clipPath' });

        // Set up grid stacking on story stage
        storyStage.style.display = 'grid';
        storyStage.style.alignItems = 'center';
        storyStage.style.justifyItems = 'center';

        panels.forEach((panel, index) => {
            panel.style.gridArea = '1 / 1';
            panel.style.position = 'relative';
            panel.style.zIndex = String(index + 1);
            panel.style.transformOrigin = '50% 50%';
            panel.style.willChange = 'transform, opacity, filter';
            panel.style.backfaceVisibility = 'hidden';
        });

        // Initial state: all hidden except first
        gsap.set(panels, { autoAlpha: 0, y: settings.distance * 0.2 * (settings.storyIntensity || 1), scale: 0.992, force3D: true });
        gsap.set(panels[0], { autoAlpha: 1, y: 0, scale: 1, force3D: true });

        // Story-specific trigger model
        const triggerOptions = {
            id: SCROLL_TRIGGER_ID,
            trigger: element,
            start: 'top top',
            end: `+=${settings.storyEnd}`,
            scrub: settings.scrub ? 0.6 : false,
            pin: true,
            invalidateOnRefresh: true,
            snap: settings.snap && panels.length > 1 ? {
                snapTo: (progress) => {
                    const step = 1 / (panels.length - 1);
                    return clamp(Math.round(progress / step) * step, 0, 1);
                },
                duration: { min: 0.1, max: 0.25 },
                delay: 0,
                ease: 'power1.inOut',
            } : false,
            onUpdate: (self) => {
                const scroll = typeof self.scroll === 'function'
                    ? self.scroll()
                    : (window.scrollY || window.pageYOffset || 0);
                const rect = element.getBoundingClientRect();
                let resolved = 0;

                if (self.isActive) {
                    resolved = clamp(self.progress || 0, 0, 1);
                } else if (scroll <= (self.start || 0)) {
                    resolved = 0;
                } else if (scroll >= (self.end || 0) || rect.bottom <= 0) {
                    resolved = 1;
                } else {
                    resolved = 0;
                }

                setStoryState(element, panels, resolved, settings, debugStory ? {
                    scroll: Number(scroll.toFixed(2)),
                    start: Number((self.start || 0).toFixed(2)),
                    end: Number((self.end || 0).toFixed(2)),
                    isActive: !!self.isActive,
                    triggerProgress: Number((self.progress || 0).toFixed(4)),
                } : null);
            },
        };

        // Create ScrollTrigger (no timeline needed — onUpdate drives everything)
        ScrollTrigger.create(triggerOptions);

        // Per-panel effect support: each panel can have data-sm-panel-effect
        panels.forEach((panel) => {
            const panelEffect = panel.dataset.smPanelEffect;
            if (panelEffect && knownEffects.includes(panelEffect)) {
                // The panel effect is applied during its incoming segment via the setStoryState
                // For now, store it so the story engine can read it per-panel later
                panel._smPanelEffect = panelEffect;
            }
        });

        debugLog(element, 'GX Scroll Motion: Story mode initialized with', panels.length, 'panels, storyEnd:', settings.storyEnd, 'intensity:', settings.storyIntensity);
        return true;
    };

    const applyGSAPOnLoad = (entry) => {
        const { element, settings } = entry;
        const gsap = window.gsap;
        if (!gsap) return false;
        clearGSAP(element);
        const duration = Math.max(0.05, (settings.onLoadDuration || 900) / 1000);
        const delay = Math.max(0, (settings.onLoadDelay || 0) / 1000);
        const children = getChildren(element, settings.childSelector, settings.story);
        const useChildren = children.length > 0 && (settings.staggerChildren || settings.story);
        const target = useChildren ? children : element;
        const { fromVars, toVars } = buildGSAPVars(settings);
        const tweenVars = { ...toVars, ease: 'power3.out', duration, delay };
        if (useChildren) {
            tweenVars.stagger = settings.staggerAmount;
        }
        gsap.fromTo(target, fromVars, tweenVars);
        entry.onLoadDone = true;
        return true;
    };

    const applyGSAP = (entry) => {
        if (textEffects.includes(entry.settings.effect)) return false;
        if (!config.enableGSAP || !window.gsap) return false;
        const { element, settings } = entry;
        if (settings.onLoad) {
            return applyGSAPOnLoad(entry);
        }
        if (!window.ScrollTrigger) return false;
        clearGSAP(element);

        // Story mode gets its own dedicated handler
        if (settings.story) {
            return applyGSAPStory(entry);
        }

        const children = getChildren(element, settings.childSelector, settings.story);
        const useChildren = children.length > 0 && (settings.staggerChildren || settings.story);
        const target = useChildren ? children : element;
        const { fromVars, toVars } = buildGSAPVars(settings);

        // Clamp end for bottom-of-page elements
        if (!settings.story) {
            const docHeight = document.documentElement.scrollHeight || 0;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
            const maxScroll = docHeight - viewportHeight;
            if (maxScroll > 0) {
                const endPx = viewportHeight * (settings.end / 100);
                const elementOffset = element.getBoundingClientRect().top + (window.scrollY || window.pageYOffset || 0);
                const elementReachesAt = elementOffset - endPx;
                if (elementReachesAt > maxScroll) {
                    const clampedEnd = Math.max(5, Math.round((elementOffset - maxScroll) / viewportHeight * 100));
                    settings.end = clampedEnd;
                }
            }
        }

        const triggerOptions = {
            id: SCROLL_TRIGGER_ID,
            trigger: element,
            start: `top ${settings.start}%`,
            end: `top ${settings.end}%`,
            scrub: settings.scrub,
            pin: settings.pin || false,
            invalidateOnRefresh: true,
            snap: settings.snap && useChildren && children.length > 1 ? {
                snapTo: (progress) => {
                    const step = 1 / (children.length - 1);
                    return clamp(Math.round(progress / step) * step, 0, 1);
                },
                duration: { min: 0.1, max: 0.25 },
                delay: 0,
                ease: 'power1.inOut'
            } : false,
        };

        if (useChildren) {
            const timeline = window.gsap.timeline({
                defaults: { ease: 'none' },
                scrollTrigger: triggerOptions,
            });

            timeline.fromTo(
                target,
                fromVars,
                {
                    ...toVars,
                    stagger: settings.staggerAmount,
                    duration: 1,
                }
            );
            return true;
        }

        window.gsap.fromTo(element, fromVars, {
            ...toVars,
            scrollTrigger: triggerOptions,
        });
        return true;
    };

    const registerAnimations = () => {
        animationElements.forEach(({ element }) => {
            clearGSAP(element);
            resetElement(element);
        });
        animationElements = [];
        const selector = '.sm-animate, [data-sm-effect], .sm-fade-up, .sm-fade-down, .sm-fade-left, .sm-fade-right, .sm-scale-in, .sm-scale-out, .sm-rotate-in, .sm-blur-in, .sm-parallax, .sm-clip-reveal, .sm-stack-cards, .sm-scrub-zoom, .sm-scramble, .sm-type-in';
        document.querySelectorAll(selector).forEach((element) => {
            const settings = getElementSettings(element);
            // For on-load entries set the effect-specific initial inline pose
            // BEFORE adding sm-motion-bound so the generic CSS fade-up baseline
            // never paints. Skip text effects — those start at opacity 0.
            if (settings.onLoad && !textEffects.includes(settings.effect)) {
                setStyles(element, styleForProgress(settings, 0));
            }
            element.classList.add('sm-motion-bound');
            animationElements.push({ element, settings, gsapReady: false });
        });
        if (animationElements.length) {
            document.documentElement.classList.add('sm-motion-ready');
        }
    };

    const registerGSAPAnimations = () => {
        if (!config.enableGSAP || !window.gsap) {
            return;
        }
        if (window.ScrollTrigger) {
            window.gsap.registerPlugin(window.ScrollTrigger);
        }
        animationElements.forEach((entry) => {
            if (entry.settings.engine === 'gsap' || entry.settings.story) {
                if (entry.settings.story && !window.ScrollTrigger) {
                    console.warn('GX Scroll Motion: ScrollTrigger not available, story mode disabled');
                    return;
                }
                debugLog(entry.element, 'GX Scroll Motion: Applying GSAP to element with settings:', entry.settings);
                entry.gsapReady = applyGSAP(entry);
            }
        });
        if (window.ScrollTrigger) {
            window.ScrollTrigger.refresh();
        }
    };

    const playOnLoadAnimations = () => {
        animationElements.forEach((entry) => {
            if (!entry.settings.onLoad || entry.onLoadDone || entry.onLoadStarted) return;
            const useGSAP = config.enableGSAP && window.gsap && entry.settings.engine === 'gsap' && !textEffects.includes(entry.settings.effect);
            if (useGSAP) {
                entry.gsapReady = applyGSAPOnLoad(entry);
            } else {
                playOnLoadNative(entry);
            }
        });
    };

    const wrapTime = (time, duration) => {
        if (duration <= 0) return 0;
        const result = time % duration;
        return result < 0 ? result + duration : result;
    };

    const isVisible = (element) => {
        const rect = element.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
        return rect.bottom > 0 && rect.top < viewportHeight;
    };

    const registerVideos = () => {
        videoElements = [];
        document.querySelectorAll('[data-sm-scroll-video]').forEach((video) => {
            const wrapper = video.closest('.sm-scroll-video');
            const state = {
                video,
                wrapper,
                ready: video.readyState >= 1,
                pendingTime: 0,
                pixelsPerSecond: parseNumber(video.dataset.smPixelsPerSecond, 700),
                loop: video.dataset.smLoop === '1',
                sectionMode: video.dataset.smSectionMode === '1' || wrapper?.dataset.smVideoSection === '1',
            };
            video.muted = true;
            video.pause();
            const markReady = () => {
                state.ready = true;
                if (state.pendingTime >= 0) {
                    try { video.currentTime = state.pendingTime; } catch (error) {}
                }
            };
            video.addEventListener('loadedmetadata', markReady, { once: true });
            video.addEventListener('canplay', markReady, { once: true });
            videoElements.push(state);
        });
    };

    const getSectionVideoTime = (state) => {
        const { wrapper, video, pixelsPerSecond, loop } = state;
        if (!wrapper) return null;
        const rect = wrapper.getBoundingClientRect();
        const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 1;
        const duration = video.duration;
        if (!Number.isFinite(duration) || duration <= 0) return null;

        const scrollRange = Math.max((wrapper.offsetHeight || 0) - viewportHeight, 1);
        const travelled = clamp(-rect.top, 0, scrollRange);
        const rawTime = travelled / Math.max(pixelsPerSecond, 1);
        return loop ? wrapTime(rawTime, duration) : clamp(rawTime, 0, duration);
    };

    const updateVideos = (deltaY) => {
        videoElements.forEach((state) => {
            const { video, ready, pixelsPerSecond, loop, sectionMode, wrapper } = state;
            const duration = video.duration;
            if (!Number.isFinite(duration) || duration <= 0) return;

            if (sectionMode && wrapper) {
                if (!isVisible(wrapper)) return;
                const targetTime = getSectionVideoTime(state);
                if (targetTime === null) return;
                state.pendingTime = targetTime;
                if (!ready) return;
                try { video.currentTime = targetTime; } catch (error) {}
                return;
            }

            if (Math.abs(deltaY) < 0.25 || !isVisible(video)) return;
            const deltaSeconds = deltaY / pixelsPerSecond;
            let targetTime = (ready ? video.currentTime : state.pendingTime) + deltaSeconds;
            targetTime = loop ? wrapTime(targetTime, duration) : clamp(targetTime, 0, duration);
            state.pendingTime = targetTime;
            if (!ready) return;
            try { video.currentTime = targetTime; } catch (error) {}
        });
    };

    const updateAll = () => {
        ticking = false;
        if (prefersReducedMotion.matches) {
            animationElements.forEach(({ element }) => {
                clearGSAP(element);
                resetElement(element);
            });
            return;
        }

        const currentScrollY = window.scrollY || window.pageYOffset || 0;
        const deltaY = currentScrollY - lastScrollY;
        lastScrollY = currentScrollY;

        animationElements.forEach((entry) => {
            if (entry.settings.onLoad) return;
            if (entry.settings.engine === 'gsap' && entry.gsapReady) return;
            if (entry.settings.story && entry.gsapReady) return;
            if (!config.enableNative && entry.settings.engine !== 'gsap') return;
            applyNativeAnimation(entry);
        });

        updateVideos(deltaY);
    };

    const requestUpdate = () => {
        if (ticking) return;
        ticking = true;
        rafId = window.requestAnimationFrame(() => {
            rafId = null;
            updateAll();
        });
    };

    const destroy = () => {
        if (!initialized) return;
        initialized = false;

        if (rafId) {
            window.cancelAnimationFrame(rafId);
            rafId = null;
        }
        ticking = false;

        window.removeEventListener('scroll', requestUpdate);
        window.removeEventListener('resize', requestUpdate);
        window.removeEventListener('beforeunload', destroy);

        if (prefersReducedMotion) {
            if (typeof prefersReducedMotion.removeEventListener === 'function') {
                prefersReducedMotion.removeEventListener('change', requestUpdate);
            } else if (typeof prefersReducedMotion.removeListener === 'function') {
                prefersReducedMotion.removeListener(requestUpdate);
            }
        }

        animationElements.forEach(({ element }) => {
            clearGSAP(element);
            resetElement(element);
        });
        animationElements = [];
        videoElements = [];

        document.documentElement.classList.remove('sm-motion-ready');
        document.querySelectorAll('.sm-motion-bound').forEach((element) => element.classList.remove('sm-motion-bound'));
    };

    const init = () => {
        if (initialized) return;
        try {
            initialized = true;
            registerAnimations();
            registerVideos();
            registerGSAPAnimations();
            playOnLoadAnimations();
            requestUpdate();
            window.addEventListener('scroll', requestUpdate, { passive: true });
            window.addEventListener('resize', requestUpdate, { passive: true });
            if (typeof prefersReducedMotion.addEventListener === 'function') {
                prefersReducedMotion.addEventListener('change', requestUpdate);
            } else if (typeof prefersReducedMotion.addListener === 'function') {
                prefersReducedMotion.addListener(requestUpdate);
            }
            window.addEventListener('beforeunload', destroy, { once: true });
            window.GXScrollMotionDestroy = destroy;
        } catch (error) {
            initialized = false;
            document.documentElement.classList.remove('sm-motion-ready');
            document.querySelectorAll('.sm-motion-bound').forEach((element) => element.classList.remove('sm-motion-bound'));
            console.error('GX Scroll Motion: init failed', error);
        }
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
