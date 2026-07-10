<?php
/**
 * Plugin Name: GX Scroll Motion
 * Plugin URI: https://www.genexmarketing.com
 * Description: Scroll-synced video scrubbing and element animation effects for GeneratePress / GenerateBlocks layouts.
 * Version: 0.7.9
 * Author: Genex Marketing Ltd.
 * License: GPL v2 or later
 * License URI: https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain: gx-scroll-motion
 * Requires at least: 6.0
 * Requires PHP: 7.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

if ( ! class_exists( 'GX_Scroll_Motion' ) ) {
    final class GX_Scroll_Motion {
        const VERSION = '0.7.9';
        const OPTION_KEY = 'gx_scroll_motion_settings';

        public static function init() {
            add_action( 'init', array( __CLASS__, 'register_asset_handles' ) );
            add_action( 'init', array( __CLASS__, 'register_blocks' ) );
            add_action( 'wp_enqueue_scripts', array( __CLASS__, 'enqueue_assets' ) );
            add_action( 'enqueue_block_editor_assets', array( __CLASS__, 'enqueue_editor_assets' ) );
            add_action( 'admin_menu', array( __CLASS__, 'register_admin_page' ) );
            add_action( 'admin_init', array( __CLASS__, 'register_settings' ) );
            add_filter( 'register_block_type_args', array( __CLASS__, 'inject_sm_block_attributes' ), 10, 2 );
            add_shortcode( 'scroll_motion', array( __CLASS__, 'render_scroll_motion_shortcode' ) );
            add_shortcode( 'scroll_motion_video', array( __CLASS__, 'render_scroll_motion_video_shortcode' ) );
        }

        /**
         * Mirror the editor-side HOC attributes on every non-plugin block at the server level.
         * Without this, ServerSideRender forwards sm* attrs to the REST block-renderer
         * endpoint and WordPress rejects them as "Invalid parameter(s): attributes".
         */
        public static function inject_sm_block_attributes( $args, $name ) {
            if ( ! is_string( $name ) || 0 === strpos( $name, 'gx-scroll-motion/' ) ) {
                return $args;
            }
            if ( ! isset( $args['attributes'] ) || ! is_array( $args['attributes'] ) ) {
                $args['attributes'] = array();
            }
            $sm_attrs = array(
                'smEnabled'         => array( 'type' => 'boolean', 'default' => false ),
                'smPreset'          => array( 'type' => 'string',  'default' => '' ),
                'smEffect'          => array( 'type' => 'string',  'default' => 'fade-up' ),
                'smEngine'          => array( 'type' => 'string',  'default' => 'native' ),
                'smHelper'          => array( 'type' => 'string',  'default' => '' ),
                'smStart'           => array( 'type' => 'number',  'default' => 85 ),
                'smEnd'             => array( 'type' => 'number',  'default' => 50 ),
                'smDistance'        => array( 'type' => 'number',  'default' => 100 ),
                'smPin'             => array( 'type' => 'boolean', 'default' => false ),
                'smStaggerChildren' => array( 'type' => 'boolean', 'default' => false ),
                'smStory'           => array( 'type' => 'boolean', 'default' => false ),
                'smSnap'            => array( 'type' => 'boolean', 'default' => false ),
                'smStoryIntensity'  => array( 'type' => 'number',  'default' => 1.0 ),
                'smOnLoad'          => array( 'type' => 'boolean', 'default' => false ),
                'smOnLoadDuration'  => array( 'type' => 'number',  'default' => 900 ),
                'smOnLoadDelay'     => array( 'type' => 'number',  'default' => 0 ),
            );
            foreach ( $sm_attrs as $key => $schema ) {
                if ( ! isset( $args['attributes'][ $key ] ) ) {
                    $args['attributes'][ $key ] = $schema;
                }
            }
            return $args;
        }

        public static function register_asset_handles() {
            $base_url = plugin_dir_url( __FILE__ );

            wp_register_style( 'gx-scroll-motion', $base_url . 'assets/css/gx-scroll-motion.css', array(), self::VERSION );
            wp_register_style( 'gx-scroll-motion-editor', $base_url . 'assets/css/gx-scroll-motion-editor.css', array( 'wp-edit-blocks' ), self::VERSION );
            wp_register_script(
                'gx-scroll-motion-editor',
                $base_url . 'assets/js/gx-scroll-motion-editor.js',
                array( 'wp-blocks', 'wp-element', 'wp-components', 'wp-block-editor', 'wp-i18n', 'wp-server-side-render', 'wp-hooks', 'wp-compose', 'wp-data' ),
                self::VERSION,
                true
            );
        }

        public static function default_settings() {
            return array(
                'enable_gsap_cdn'      => 0,
                'enable_native_engine' => 1,
                'enable_editor_blocks' => 1,
            );
        }

        public static function get_settings() {
            return wp_parse_args( get_option( self::OPTION_KEY, array() ), self::default_settings() );
        }

        public static function register_settings() {
            register_setting(
                'gx_scroll_motion_settings_group',
                self::OPTION_KEY,
                array(
                    'type'              => 'array',
                    'sanitize_callback' => array( __CLASS__, 'sanitize_settings' ),
                    'default'           => self::default_settings(),
                )
            );
        }

        public static function sanitize_settings( $input ) {
            return array(
                'enable_gsap_cdn'      => empty( $input['enable_gsap_cdn'] ) ? 0 : 1,
                'enable_native_engine' => empty( $input['enable_native_engine'] ) ? 0 : 1,
                'enable_editor_blocks' => empty( $input['enable_editor_blocks'] ) ? 0 : 1,
            );
        }

        public static function enqueue_assets() {
            $settings = self::get_settings();
            $base_url = plugin_dir_url( __FILE__ );

            wp_enqueue_style( 'gx-scroll-motion' );

            if ( ! empty( $settings['enable_gsap_cdn'] ) ) {
                wp_enqueue_script( 'gsap', 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js', array(), '3.12.5', true );
                wp_enqueue_script( 'gsap-scrolltrigger', 'https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/ScrollTrigger.min.js', array( 'gsap' ), '3.12.5', true );
            }

            wp_register_script(
                'gx-scroll-motion',
                $base_url . 'assets/js/gx-scroll-motion.js',
                ! empty( $settings['enable_gsap_cdn'] ) ? array( 'gsap-scrolltrigger' ) : array(),
                self::VERSION,
                true
            );

            wp_localize_script(
                'gx-scroll-motion',
                'GXScrollMotionConfig',
                array(
                    'enableGSAP'   => ! empty( $settings['enable_gsap_cdn'] ),
                    'enableNative' => ! empty( $settings['enable_native_engine'] ),
                    'presets'      => self::preset_config(),
                    'helpers'      => self::generateblocks_helpers(),
                )
            );

            wp_enqueue_script( 'gx-scroll-motion' );
        }

        public static function enqueue_editor_assets() {
            $settings = self::get_settings();
            if ( empty( $settings['enable_editor_blocks'] ) ) {
                return;
            }

            wp_enqueue_style( 'gx-scroll-motion-editor' );
            wp_enqueue_script( 'gx-scroll-motion-editor' );
            wp_localize_script(
                'gx-scroll-motion-editor',
                'GXScrollMotionEditor',
                array(
                    'presets' => self::preset_config(),
                    'effects' => self::effect_options(),
                    'helpers' => self::generateblocks_helpers(),
                )
            );
        }

        public static function register_blocks() {
            register_block_type(
                'gx-scroll-motion/animated-section',
                array(
                    'api_version'     => 2,
                    'editor_script'   => 'gx-scroll-motion-editor',
                    'editor_style'    => 'gx-scroll-motion-editor',
                    'style'           => 'gx-scroll-motion',
                    'render_callback' => array( __CLASS__, 'render_animated_section_block' ),
                    'attributes'      => self::animated_section_attributes(),
                )
            );

            register_block_type(
                'gx-scroll-motion/scroll-video',
                array(
                    'api_version'     => 2,
                    'editor_script'   => 'gx-scroll-motion-editor',
                    'editor_style'    => 'gx-scroll-motion-editor',
                    'style'           => 'gx-scroll-motion',
                    'render_callback' => array( __CLASS__, 'render_scroll_video_block' ),
                    'attributes'      => self::scroll_video_attributes(),
                )
            );
        }

        public static function animated_section_attributes() {
            return array(
                'effect'          => array( 'type' => 'string', 'default' => 'fade-up' ),
                'preset'          => array( 'type' => 'string', 'default' => '' ),
                'engine'          => array( 'type' => 'string', 'default' => 'native' ),
                'start'           => array( 'type' => 'number', 'default' => 85 ),
                'end'             => array( 'type' => 'number', 'default' => 50 ),
                'distance'        => array( 'type' => 'number', 'default' => 100 ),
                'scaleFrom'       => array( 'type' => 'number', 'default' => 0.85 ),
                'rotateFrom'      => array( 'type' => 'number', 'default' => 16 ),
                'blurFrom'        => array( 'type' => 'number', 'default' => 10 ),
                'opacityFrom'     => array( 'type' => 'number', 'default' => 0 ),
                'extraClass'      => array( 'type' => 'string', 'default' => '' ),
                'anchor'          => array( 'type' => 'string', 'default' => '' ),
                'pin'             => array( 'type' => 'boolean', 'default' => false ),
                'scrub'           => array( 'type' => 'boolean', 'default' => true ),
                'staggerChildren' => array( 'type' => 'boolean', 'default' => false ),
                'staggerAmount'   => array( 'type' => 'number', 'default' => 0.12 ),
                'childSelector'   => array( 'type' => 'string', 'default' => '[data-sm-child], .sm-child, .gb-grid-column, .gb-headline, .gb-button-wrapper' ),
                'story'           => array( 'type' => 'boolean', 'default' => false ),
                'snap'            => array( 'type' => 'boolean', 'default' => false ),
                'storyEnd'        => array( 'type' => 'number', 'default' => 400 ),
                'storyIntensity'  => array( 'type' => 'number', 'default' => 1.0 ),
                'onLoad'          => array( 'type' => 'boolean', 'default' => false ),
                'onLoadDuration'  => array( 'type' => 'number', 'default' => 900 ),
                'onLoadDelay'     => array( 'type' => 'number', 'default' => 0 ),
                'innerContent'    => array( 'type' => 'string', 'source' => 'html', 'selector' => '.sm-block-content' ),
            );
        }

        public static function scroll_video_attributes() {
            return array(
                'src'             => array( 'type' => 'string', 'default' => '' ),
                'poster'          => array( 'type' => 'string', 'default' => '' ),
                'className'       => array( 'type' => 'string', 'default' => '' ),
                'pixelsPerSecond' => array( 'type' => 'number', 'default' => 700 ),
                'loop'            => array( 'type' => 'boolean', 'default' => false ),
                'preload'         => array( 'type' => 'string', 'default' => 'metadata' ),
                'caption'         => array( 'type' => 'string', 'default' => '' ),
                'sectionMode'     => array( 'type' => 'boolean', 'default' => true ),
                'sectionHeightVh' => array( 'type' => 'number', 'default' => 220 ),
                'stageHeightVh'   => array( 'type' => 'number', 'default' => 100 ),
            );
        }

        public static function effect_options() {
            return array(
                array( 'label' => 'Fade Up', 'value' => 'fade-up' ),
                array( 'label' => 'Fade Down', 'value' => 'fade-down' ),
                array( 'label' => 'Fade Left', 'value' => 'fade-left' ),
                array( 'label' => 'Fade Right', 'value' => 'fade-right' ),
                array( 'label' => 'Scale In', 'value' => 'scale-in' ),
                array( 'label' => 'Scale Out', 'value' => 'scale-out' ),
                array( 'label' => 'Rotate In', 'value' => 'rotate-in' ),
                array( 'label' => 'Blur In', 'value' => 'blur-in' ),
                array( 'label' => 'Scramble Text', 'value' => 'scramble' ),
                array( 'label' => 'Parallax', 'value' => 'parallax' ),
                array( 'label' => 'Clip Reveal', 'value' => 'clip-reveal' ),
                array( 'label' => 'Stack Cards', 'value' => 'stack-cards' ),
                array( 'label' => 'Scrub Zoom', 'value' => 'scrub-zoom' ),
                array( 'label' => 'Type In Text', 'value' => 'type-in' ),
            );
        }

        public static function preset_config() {
            return array(
                'hero-reveal' => array(
                    'label'          => 'Hero Reveal',
                    'description'    => 'Big intro motion for hero copy and headline stacks.',
                    'effect'         => 'fade-up',
                    'engine'         => 'gsap',
                    'start'          => 92,
                    'end'            => 50,
                    'distance'       => 140,
                    'scaleFrom'      => 0.94,
                    'opacityFrom'    => 0,
                    'staggerChildren'=> true,
                    'staggerAmount'  => 0.14,
                ),
                'card-lift' => array(
                    'label'          => 'Card Lift',
                    'description'    => 'Subtle rise and settle for service cards and icon boxes.',
                    'effect'         => 'scale-in',
                    'engine'         => 'native',
                    'start'          => 88,
                    'end'            => 50,
                    'distance'       => 72,
                    'scaleFrom'      => 0.94,
                    'opacityFrom'    => 0.05,
                    'staggerChildren'=> true,
                    'staggerAmount'  => 0.08,
                ),
                'testimonial-float' => array(
                    'label'       => 'Testimonial Float',
                    'description' => 'Soft parallax drift for quotes and social proof blocks.',
                    'effect'      => 'parallax',
                    'engine'      => 'native',
                    'start'       => 95,
                    'end'         => 50,
                    'distance'    => 90,
                    'scaleFrom'   => 1,
                    'opacityFrom' => 1,
                ),
                'stacked-cards' => array(
                    'label'          => 'Stacked Cards',
                    'description'    => 'GSAP stack feel for repeated cards or story panels.',
                    'effect'         => 'stack-cards',
                    'engine'         => 'gsap',
                    'start'          => 90,
                    'end'            => 50,
                    'distance'       => 110,
                    'scaleFrom'      => 0.88,
                    'opacityFrom'    => 0,
                    'staggerChildren'=> true,
                    'staggerAmount'  => 0.12,
                ),
                'story-panels' => array(
                    'label'          => 'Story Panels',
                    'description'    => 'Pinned narrative panels for step-by-step storytelling sections.',
                    'effect'         => 'fade-up',
                    'engine'         => 'gsap',
                    'start'          => 94,
                    'end'            => 50,
                    'distance'       => 96,
                    'scaleFrom'      => 0.985,
                    'opacityFrom'    => 0,
                    'story'          => true,
                    'snap'           => true,
                    'pin'            => true,
                ),
                'scrub-zoom' => array(
                    'label'       => 'Scrub Zoom',
                    'description' => 'GSAP zoom + fade for media showcases.',
                    'effect'      => 'scrub-zoom',
                    'engine'      => 'gsap',
                    'start'       => 95,
                    'end'         => 50,
                    'distance'    => 0,
                    'scaleFrom'   => 1.18,
                    'opacityFrom' => 0.2,
                ),
                'text-type-in' => array(
                    'label'       => 'Text Type In',
                    'description' => 'Types copy in progressively as the element enters the viewport.',
                    'effect'      => 'type-in',
                    'engine'      => 'native',
                    'start'       => 96,
                    'end'         => 50,
                    'distance'    => 0,
                    'opacityFrom' => 0,
                ),
            );
        }

        public static function generateblocks_helpers() {
            return array(
                array(
                    'class'       => 'sm-gb-hero-stack',
                    'label'       => 'GenerateBlocks Hero Stack',
                    'description' => 'Use on a GB container holding eyebrow, headline, text, and buttons. Pair with preset hero-reveal.',
                    'example'     => 'sm-animate sm-preset-hero-reveal sm-gb-hero-stack',
                ),
                array(
                    'class'       => 'sm-gb-card-grid',
                    'label'       => 'GenerateBlocks Card Grid',
                    'description' => 'Use on a GB grid/container. Each child card gets stagger-ready behavior.',
                    'example'     => 'sm-animate sm-preset-card-lift sm-gb-card-grid',
                ),
                array(
                    'class'       => 'sm-gb-testimonial-strip',
                    'label'       => 'GenerateBlocks Testimonial Strip',
                    'description' => 'Use on testimonial rows for soft float motion and cleaner quote spacing.',
                    'example'     => 'sm-animate sm-preset-testimonial-float sm-gb-testimonial-strip',
                ),
            );
        }

        public static function register_admin_page() {
            add_options_page( __( 'GX Scroll Motion', 'gx-scroll-motion' ), __( 'GX Scroll Motion', 'gx-scroll-motion' ), 'manage_options', 'gx-scroll-motion', array( __CLASS__, 'render_admin_page' ) );
        }

        public static function render_admin_page() {
            if ( ! current_user_can( 'manage_options' ) ) {
                return;
            }

            $settings = self::get_settings();
            $helpers  = self::generateblocks_helpers();
            ?>
            <div class="wrap">
                <h1><?php echo esc_html__( 'GX Scroll Motion', 'gx-scroll-motion' ); ?></h1>
                <p><?php echo esc_html__( 'Scroll-linked motion for GeneratePress and GenerateBlocks, with presets, block controls, staggers, and pinned storytelling.', 'gx-scroll-motion' ); ?></p>

                <form method="post" action="options.php">
                    <?php settings_fields( 'gx_scroll_motion_settings_group' ); ?>
                    <table class="form-table" role="presentation">
                        <tr>
                            <th scope="row"><?php echo esc_html__( 'Load native animation engine', 'gx-scroll-motion' ); ?></th>
                            <td><label><input type="checkbox" name="<?php echo esc_attr( self::OPTION_KEY ); ?>[enable_native_engine]" value="1" <?php checked( ! empty( $settings['enable_native_engine'] ) ); ?>> <?php echo esc_html__( 'Enable lightweight built-in scroll engine', 'gx-scroll-motion' ); ?></label></td>
                        </tr>
                        <tr>
                            <th scope="row"><?php echo esc_html__( 'Load editor blocks', 'gx-scroll-motion' ); ?></th>
                            <td><label><input type="checkbox" name="<?php echo esc_attr( self::OPTION_KEY ); ?>[enable_editor_blocks]" value="1" <?php checked( ! empty( $settings['enable_editor_blocks'] ) ); ?>> <?php echo esc_html__( 'Enable Animated Section and Scroll Video Gutenberg blocks', 'gx-scroll-motion' ); ?></label></td>
                        </tr>
                        <tr>
                            <th scope="row"><?php echo esc_html__( 'Load GSAP from CDN', 'gx-scroll-motion' ); ?></th>
                            <td>
                                <label><input type="checkbox" name="<?php echo esc_attr( self::OPTION_KEY ); ?>[enable_gsap_cdn]" value="1" <?php checked( ! empty( $settings['enable_gsap_cdn'] ) ); ?>> <?php echo esc_html__( 'Enable GSAP + ScrollTrigger for pinning, snap points, staggered sequences, and storytelling timelines.', 'gx-scroll-motion' ); ?></label>
                                <p class="description"><?php echo esc_html__( 'If disabled, GSAP-specific presets fall back to the native engine where possible.', 'gx-scroll-motion' ); ?></p>
                            </td>
                        </tr>
                    </table>
                    <?php submit_button(); ?>
                </form>

                <h2><?php echo esc_html__( 'GenerateBlocks helper classes', 'gx-scroll-motion' ); ?></h2>
                <table class="widefat striped">
                    <thead><tr><th><?php echo esc_html__( 'Class', 'gx-scroll-motion' ); ?></th><th><?php echo esc_html__( 'Use', 'gx-scroll-motion' ); ?></th><th><?php echo esc_html__( 'Example', 'gx-scroll-motion' ); ?></th></tr></thead>
                    <tbody>
                    <?php foreach ( $helpers as $helper ) : ?>
                        <tr>
                            <td><code><?php echo esc_html( $helper['class'] ); ?></code></td>
                            <td><?php echo esc_html( $helper['description'] ); ?></td>
                            <td><code><?php echo esc_html( $helper['example'] ); ?></code></td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>

                <h2><?php echo esc_html__( 'Copy-paste GenerateBlocks examples', 'gx-scroll-motion' ); ?></h2>
                <pre>Hero container: sm-animate sm-preset-hero-reveal sm-gb-hero-stack
Service grid: sm-animate sm-preset-card-lift sm-gb-card-grid
Testimonials: sm-animate sm-preset-testimonial-float sm-gb-testimonial-strip
Story stage: sm-animate sm-preset-story-panels sm-story-stage sm-pin
Story panel child: sm-story-panel</pre>

                <h2><?php echo esc_html__( 'Shortcodes', 'gx-scroll-motion' ); ?></h2>
                <pre>[scroll_motion preset="story-panels" engine="gsap" pin="1" snap="1" child_selector=".sm-story-panel" story="1" story_end="700"]Your panels[/scroll_motion]</pre>
                <pre>[scroll_motion preset="card-lift" stagger_children="1" stagger_amount="0.1" child_selector=".gb-grid-column"]Your grid[/scroll_motion]</pre>
                <pre>[scroll_motion_video src="https://example.com/demo.mp4" poster="https://example.com/poster.jpg" pixels_per_second="700" caption="Scroll me"]</pre>

                <h2><?php echo esc_html__( 'Editor workflow', 'gx-scroll-motion' ); ?></h2>
                <ol>
                    <li><?php echo esc_html__( 'Insert Animated Section.', 'gx-scroll-motion' ); ?></li>
                    <li><?php echo esc_html__( 'Pick a preset or helper pattern for GenerateBlocks-style sections.', 'gx-scroll-motion' ); ?></li>
                    <li><?php echo esc_html__( 'Turn on stagger for child sequences or story mode for pinned narrative panels.', 'gx-scroll-motion' ); ?></li>
                    <li><?php echo esc_html__( 'Enable snap points when you want each panel to land cleanly on scroll.', 'gx-scroll-motion' ); ?></li>
                </ol>
            </div>
            <?php
        }

        public static function render_animated_section_block( $attributes, $content ) {
            return self::render_motion_markup( $attributes, $content );
        }

        public static function render_scroll_video_block( $attributes ) {
            return self::render_video_markup( $attributes );
        }

        public static function render_scroll_motion_shortcode( $atts, $content = null ) {
            $content = null === $content ? '' : $content;
            $atts = shortcode_atts(
                array(
                    'effect'            => 'fade-up',
                    'preset'            => '',
                    'engine'            => 'native',
                    'start'             => 85,
                    'end'               => 50,
                    'distance'          => 100,
                    'scale_from'        => 0.85,
                    'rotate_from'       => 16,
                    'blur_from'         => 10,
                    'opacity_from'      => 0,
                    'class'             => '',
                    'tag'               => 'div',
                    'anchor'            => '',
                    'pin'               => 0,
                    'scrub'             => 1,
                    'stagger_children'  => 0,
                    'stagger_amount'    => 0.12,
                    'child_selector'    => '[data-sm-child], .sm-child, .gb-grid-column, .gb-headline, .gb-button-wrapper',
                    'story'             => 0,
                    'snap'              => 0,
                    'story_end'         => 400,
                    'story_intensity'   => 1.0,
                    'on_load'           => 0,
                    'on_load_duration'  => 900,
                    'on_load_delay'     => 0,
                ),
                $atts,
                'scroll_motion'
            );

            $render_attributes = array(
                'effect'          => $atts['effect'],
                'preset'          => $atts['preset'],
                'engine'          => $atts['engine'],
                'start'           => $atts['start'],
                'end'             => $atts['end'],
                'distance'        => $atts['distance'],
                'scaleFrom'       => $atts['scale_from'],
                'rotateFrom'      => $atts['rotate_from'],
                'blurFrom'        => $atts['blur_from'],
                'opacityFrom'     => $atts['opacity_from'],
                'extraClass'      => $atts['class'],
                'anchor'          => $atts['anchor'],
                'pin'             => ! empty( $atts['pin'] ),
                'scrub'           => ! isset( $atts['scrub'] ) || ! empty( $atts['scrub'] ),
                'staggerChildren' => ! empty( $atts['stagger_children'] ),
                'staggerAmount'   => $atts['stagger_amount'],
                'childSelector'   => $atts['child_selector'],
                'story'           => ! empty( $atts['story'] ),
                'snap'            => ! empty( $atts['snap'] ),
                'storyEnd'        => $atts['story_end'],
                'storyIntensity'  => floatval( $atts['story_intensity'] ),
                'onLoad'          => ! empty( $atts['on_load'] ),
                'onLoadDuration'  => $atts['on_load_duration'],
                'onLoadDelay'     => $atts['on_load_delay'],
                'tag'             => $atts['tag'],
            );

            return self::render_motion_markup( $render_attributes, wp_kses_post( do_shortcode( shortcode_unautop( $content ) ) ) );
        }

        public static function render_scroll_motion_video_shortcode( $atts ) {
            $atts = shortcode_atts(
                array(
                    'src'               => '',
                    'poster'            => '',
                    'class'             => '',
                    'pixels_per_second' => 700,
                    'loop'              => 0,
                    'preload'           => 'metadata',
                    'caption'           => '',
                ),
                $atts,
                'scroll_motion_video'
            );

            return self::render_video_markup(
                array(
                    'src'             => $atts['src'],
                    'poster'          => $atts['poster'],
                    'className'       => $atts['class'],
                    'pixelsPerSecond' => $atts['pixels_per_second'],
                    'loop'            => ! empty( $atts['loop'] ),
                    'preload'         => $atts['preload'],
                    'caption'         => $atts['caption'],
                )
            );
        }

        private static function render_motion_markup( $attributes, $content ) {
            $attributes = self::apply_preset( $attributes );
            $tag        = isset( $attributes['tag'] ) ? $attributes['tag'] : 'div';
            $tag        = in_array( $tag, array( 'div', 'section', 'span', 'article', 'aside', 'figure' ), true ) ? $tag : 'div';
            $engine     = isset( $attributes['engine'] ) ? self::sanitize_slug( $attributes['engine'] ) : 'native';
            $effect     = isset( $attributes['effect'] ) ? self::sanitize_slug( $attributes['effect'] ) : 'fade-up';
            $preset     = isset( $attributes['preset'] ) ? self::sanitize_slug( $attributes['preset'] ) : '';
            $classes    = array_filter(
                array(
                    'sm-animate',
                    'sm-' . $effect,
                    $preset ? 'sm-preset-' . $preset : '',
                    'sm-engine-' . $engine,
                    ! empty( $attributes['pin'] ) ? 'sm-pin' : '',
                    ! empty( $attributes['staggerChildren'] ) ? 'sm-stagger-children' : '',
                    ! empty( $attributes['story'] ) ? 'sm-story-stage' : '',
                    ! empty( $attributes['snap'] ) ? 'sm-snap-story' : '',
                    ! empty( $attributes['onLoad'] ) ? 'sm-on-load' : '',
                    ! empty( $attributes['extraClass'] ) ? sanitize_text_field( $attributes['extraClass'] ) : '',
                )
            );

            $html_attributes = array(
                'class'                  => implode( ' ', $classes ),
                'data-sm-effect'         => $effect,
                'data-sm-preset'         => $preset,
                'data-sm-engine'         => $engine,
                'data-sm-start'          => self::sanitize_number( $attributes['start'], 85 ),
                'data-sm-end'            => self::sanitize_number( $attributes['end'], 50 ),
                'data-sm-distance'       => self::sanitize_number( $attributes['distance'], 100 ),
                'data-sm-scale-from'     => self::sanitize_float( $attributes['scaleFrom'], 0.85 ),
                'data-sm-rotate-from'    => self::sanitize_number( $attributes['rotateFrom'], 16 ),
                'data-sm-blur-from'      => self::sanitize_number( $attributes['blurFrom'], 10 ),
                'data-sm-opacity-from'   => self::sanitize_float( $attributes['opacityFrom'], 0 ),
                'data-sm-pin'            => empty( $attributes['pin'] ) ? '0' : '1',
                'data-sm-scrub'          => isset( $attributes['scrub'] ) && empty( $attributes['scrub'] ) ? '0' : '1',
                'data-sm-stagger'        => empty( $attributes['staggerChildren'] ) ? '0' : '1',
                'data-sm-stagger-amount' => self::sanitize_float( $attributes['staggerAmount'], 0.12 ),
                'data-sm-child-selector' => ! empty( $attributes['childSelector'] ) ? sanitize_text_field( $attributes['childSelector'] ) : '[data-sm-child], .sm-child, .gb-grid-column, .gb-headline, .gb-button-wrapper',
                'data-sm-story'          => empty( $attributes['story'] ) ? '0' : '1',
                'data-sm-snap'           => empty( $attributes['snap'] ) ? '0' : '1',
                'data-sm-story-end'      => self::sanitize_number( $attributes['storyEnd'], 400 ),
                'data-sm-story-intensity' => self::sanitize_float( $attributes['storyIntensity'], 1.0 ),
                'data-sm-on-load'        => empty( $attributes['onLoad'] ) ? '0' : '1',
                'data-sm-on-load-duration' => self::sanitize_number( isset( $attributes['onLoadDuration'] ) ? $attributes['onLoadDuration'] : 900, 900 ),
                'data-sm-on-load-delay'  => self::sanitize_number( isset( $attributes['onLoadDelay'] ) ? $attributes['onLoadDelay'] : 0, 0 ),
                'id'                     => ! empty( $attributes['anchor'] ) ? sanitize_title( $attributes['anchor'] ) : '',
            );

            return sprintf( '<%1$s %2$s><div class="sm-block-content">%3$s</div></%1$s>', tag_escape( $tag ), self::build_html_attributes( $html_attributes ), $content );
        }

        private static function render_video_markup( $attributes ) {
            if ( empty( $attributes['src'] ) ) {
                return '';
            }

            $section_mode      = ! isset( $attributes['sectionMode'] ) || ! empty( $attributes['sectionMode'] );
            $section_height_vh = max( 100, min( 600, intval( $attributes['sectionHeightVh'] ?? 220 ) ) );
            $stage_height_vh   = max( 40, min( 100, intval( $attributes['stageHeightVh'] ?? 100 ) ) );
            $wrapper_classes   = array_filter( array(
                'sm-scroll-video',
                $section_mode ? 'sm-scroll-video--section' : '',
                ! empty( $attributes['className'] ) ? sanitize_text_field( $attributes['className'] ) : '',
            ) );
            $wrapper_attributes = array(
                'class'                      => implode( ' ', $wrapper_classes ),
                'data-sm-video-section'      => $section_mode ? '1' : '0',
                'data-sm-video-section-vh'   => self::sanitize_number( $section_height_vh, 220 ),
                'data-sm-video-stage-vh'     => self::sanitize_number( $stage_height_vh, 100 ),
                'style'                      => sprintf( '--sm-video-section-height:%1$svh;--sm-video-stage-height:%2$svh;', $section_height_vh, $stage_height_vh ),
            );
            $preload = isset( $attributes['preload'] ) ? $attributes['preload'] : 'metadata';
            $src_raw = esc_url_raw( (string) $attributes['src'] );
            if ( '' === $src_raw ) {
                return '';
            }
            $poster_raw = ! empty( $attributes['poster'] ) ? esc_url_raw( (string) $attributes['poster'] ) : '';
            $video_attributes = array(
                'class'                     => 'sm-scroll-video__media',
                'src'                       => $src_raw,
                'poster'                    => $poster_raw,
                'preload'                   => in_array( $preload, array( 'none', 'metadata', 'auto' ), true ) ? $preload : 'metadata',
                'playsinline'               => 'playsinline',
                'webkit-playsinline'        => 'webkit-playsinline',
                'muted'                     => 'muted',
                'data-sm-scroll-video'      => '1',
                'data-sm-pixels-per-second' => self::sanitize_number( $attributes['pixelsPerSecond'], 700 ),
                'data-sm-loop'              => ! empty( $attributes['loop'] ) ? '1' : '0',
                'data-sm-section-mode'      => $section_mode ? '1' : '0',
            );
            $caption = ! empty( $attributes['caption'] ) ? sprintf( '<figcaption class="sm-scroll-video__caption">%s</figcaption>', esc_html( $attributes['caption'] ) ) : '';

            if ( $section_mode ) {
                return sprintf(
                    '<figure %1$s><div class="sm-scroll-video__stage"><video %2$s></video>%3$s</div></figure>',
                    self::build_html_attributes( $wrapper_attributes ),
                    self::build_html_attributes( $video_attributes ),
                    $caption
                );
            }

            return sprintf(
                '<figure %1$s><video %2$s></video>%3$s</figure>',
                self::build_html_attributes( $wrapper_attributes ),
                self::build_html_attributes( $video_attributes ),
                $caption
            );
        }

        private static function apply_preset( $attributes ) {
            $preset  = isset( $attributes['preset'] ) ? self::sanitize_slug( $attributes['preset'] ) : '';
            $presets = self::preset_config();
            if ( ! $preset || empty( $presets[ $preset ] ) ) {
                return $attributes;
            }

            $skip_keys = array( 'label', 'description' );
            foreach ( $presets[ $preset ] as $key => $value ) {
                if ( in_array( $key, $skip_keys, true ) ) {
                    continue;
                }
                $mapped_key = self::map_preset_key_to_attribute( $key );
                if ( ! isset( $attributes[ $mapped_key ] ) || '' === $attributes[ $mapped_key ] || in_array( $mapped_key, array( 'effect', 'engine', 'story', 'snap', 'staggerChildren', 'staggerAmount' ), true ) ) {
                    $attributes[ $mapped_key ] = $value;
                }
            }
            return $attributes;
        }

        private static function map_preset_key_to_attribute( $key ) {
            $map = array(
                'scaleFrom'       => 'scaleFrom',
                'opacityFrom'     => 'opacityFrom',
                'staggerChildren' => 'staggerChildren',
                'staggerAmount'   => 'staggerAmount',
                'childSelector'   => 'childSelector',
                'story'           => 'story',
                'snap'            => 'snap',
                'storyEnd'        => 'storyEnd',
                'storyIntensity'  => 'storyIntensity',
                'pin'             => 'pin',
            );
            return isset( $map[ $key ] ) ? $map[ $key ] : $key;
        }

        private static function build_html_attributes( $attributes ) {
            $parts = array();
            foreach ( $attributes as $key => $value ) {
                if ( '' === $value || null === $value ) {
                    continue;
                }
                $parts[] = sprintf( '%1$s="%2$s"', esc_attr( $key ), esc_attr( $value ) );
            }
            return implode( ' ', $parts );
        }

        private static function sanitize_number( $value, $default ) {
            return is_numeric( $value ) ? (string) ( 0 + $value ) : (string) $default;
        }

        private static function sanitize_float( $value, $default ) {
            return is_numeric( $value ) ? (string) (float) $value : (string) $default;
        }

        private static function sanitize_slug( $value ) {
            if ( ! is_scalar( $value ) ) {
                return '';
            }
            return preg_replace( '/[^a-z0-9\-]/', '', strtolower( (string) $value ) );
        }
    }

    GX_Scroll_Motion::init();
}
