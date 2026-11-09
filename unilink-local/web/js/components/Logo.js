// ==========================================================
// COMPONENTE: Logo UniLink (+ ISO 9001/14001/45001 + ESG FIEC)
// Duas imagens com o mesmo tamanho: a azul aparece no modo claro
// e a branca no modo escuro (alternância via html.dark, ver index.html).
// ==========================================================
const LOGO_W = 690;
const LOGO_H = 208;

const Logo = ({ variant = "full" }) => {
    const imagens = (
        <React.Fragment>
            <img
                src="img/unilink-esg-azul.png"
                alt="UniLink Transportes Integrados — ISO 9001, ISO 14001, ISO 45001 e ESG FIEC"
                width={LOGO_W}
                height={LOGO_H}
                className="logo-img logo-img-claro w-full h-auto mx-auto"
                decoding="async"
                draggable="false"
            />
            <img
                src="img/unilink-esg-branco.png"
                alt=""
                aria-hidden="true"
                width={LOGO_W}
                height={LOGO_H}
                className="logo-img logo-img-escuro w-full h-auto mx-auto"
                decoding="async"
                draggable="false"
            />
        </React.Fragment>
    );

    if (variant === "mark") {
        return (
            <div className="w-8 h-8 rounded-md bg-[#0E3263] flex items-center justify-center shrink-0" aria-hidden="true">
                <span className="text-white font-bold italic text-base leading-none tracking-tight">U</span>
            </div>
        );
    }

    if (variant === "header") {
        return (
            <div className="w-32 sm:w-44 md:w-48">
                {imagens}
            </div>
        );
    }

    return (
        <div className="w-full max-w-xs sm:max-w-sm mx-auto flex justify-center items-center">
            <div className="w-full">
                {imagens}
            </div>
        </div>
    );
};
