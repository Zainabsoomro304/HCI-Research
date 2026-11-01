# Fits the starting-point model for one test split and writes the pairwise contrasts at each k.
#   Rscript stats/curve_glmm.R <input.csv> <output.csv> <slopes: 0|1>
# Python averages the estimates and standard errors across splits and applies the Holm correction.
suppressPackageStartupMessages({
  library(lme4)
  library(emmeans)
})
emm_options(lmer.df = "asymptotic")

args <- commandArgs(trailingOnly = TRUE)
input <- args[[1]]
output <- args[[2]]
slopes <- args[[3]] == "1"

d <- read.csv(input, stringsAsFactors = FALSE)
d$start <- factor(d$start, levels = c("scratch", "global", "cluster_choice", "cluster_questionnaire"))
d$participant <- factor(d$participant)
d$test_pair <- factor(d$test_pair)
d$log_k <- log(d$k)
ks <- sort(unique(d$k))

formula <- if (slopes) {
  correct ~ start * log_k + (start | participant) + (1 | test_pair)
} else {
  correct ~ start * log_k + (1 | participant) + (1 | test_pair)
}

messages <- character()
model <- withCallingHandlers(
  glmer(formula, data = d, family = binomial, nAGQ = 0,
        control = glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 2e5))),
  warning = function(w) {
    messages <<- c(messages, conditionMessage(w))
    invokeRestart("muffleWarning")
  }
)

grid <- emmeans(model, ~ start | log_k, at = list(log_k = log(ks)))
contrasts <- as.data.frame(pairs(grid, adjust = "none"))
out <- data.frame(
  contrast = contrasts$contrast,
  k = round(exp(contrasts$log_k)),
  estimate = contrasts$estimate,
  se = contrasts$SE,
  singular = isSingular(model),
  warnings = paste(unique(messages), collapse = " | ")
)
write.csv(out, output, row.names = FALSE)
